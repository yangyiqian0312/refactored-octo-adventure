import cors from "@fastify/cors";
import {
  calculateOrderTier,
  maskBuyerDisplayName,
  orderAlertSchema,
  testOrderRequestSchema,
  type OrderAlert
} from "@live-alerts/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { Server as SocketIOServer } from "socket.io";
import { ZodError } from "zod";
import type { AppConfig } from "./config.js";
import { logger } from "./logger.js";
import { InMemoryOrderStore } from "./store.js";
import {
  buildTikTokDedupeKey,
  extractTikTokEventId,
  extractTikTokOrderId,
  extractTikTokShopId,
  extractTikTokOrderStatus,
  normalizeTikTokOrderDetailsAlert,
  normalizeTikTokOrderAlert,
  shouldCreateAlertForTikTokStatus
} from "./tiktok/normalizeOrder.js";
import {
  PlaceholderTikTokOrderClient,
  TikTokApiError,
  TikTokShopOrderClient,
  type TikTokOrderClient
} from "./tiktok/client.js";
import { exchangeTikTokAuthCode, getTikTokAuthorizedShops } from "./tiktok/auth.js";
import { tiktokWebhookPayloadSchema } from "./tiktok/types.js";
import { verifyTikTokWebhookSignature } from "./tiktok/webhookVerifier.js";

export type AppContext = {
  app: FastifyInstance;
  io: SocketIOServer;
  store: InMemoryOrderStore;
};

export async function createApp(config: AppConfig): Promise<AppContext> {
  const app = Fastify({
    logger: false,
    bodyLimit: 1024 * 1024
  });
  const store = new InMemoryOrderStore();
  const tiktokOrderClient = createTikTokOrderClient(config);

  await app.register(cors, {
    origin: true,
    methods: ["GET", "POST", "OPTIONS"]
  });

  app.addContentTypeParser(
    "application/json",
    { parseAs: "string" },
    (_request, body, done) => done(null, body)
  );
  app.addContentTypeParser("*", { parseAs: "string" }, (_request, body, done) => done(null, body));

  const io = new SocketIOServer(app.server, {
    cors: {
      origin: "*"
    }
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth.token ?? socket.handshake.query.token;

    if (token !== config.overlayAllowedToken) {
      next(new Error("invalid overlay token"));
      return;
    }

    next();
  });

  io.on("connection", (socket) => {
    logger.info("overlay connected", { socketId: socket.id });
    socket.emit("recent:alerts", store.getRecentAlerts());
  });

  app.get("/health", async () => ({ ok: true }));

  app.post("/api/test-order", async (request, reply) => {
    try {
      const input = testOrderRequestSchema.parse(parseJsonBody(request.body));
      const alert = orderAlertSchema.parse({
        id: crypto.randomUUID(),
        source: "test",
        buyerDisplayName: maskBuyerDisplayName(input.buyerName),
        productTitle: input.productTitle,
        quantity: input.quantity,
        imageUrl: input.imageUrl,
        createdAt: new Date().toISOString(),
        tier: calculateOrderTier(input.quantity)
      } satisfies OrderAlert);

      store.addAlert(alert);
      io.emit("order:created", alert);
      logger.info("test order alert created", {
        eventId: alert.id,
        source: alert.source,
        quantity: alert.quantity,
        tier: alert.tier
      });

      return { ok: true, eventId: alert.id };
    } catch (error) {
      if (error instanceof ZodError) {
        return reply.status(400).send({ ok: false, error: "invalid test order payload" });
      }

      logger.error("test order failed");
      return reply.status(500).send({ ok: false, error: "failed to create test order" });
    }
  });

  app.get("/api/recent-alerts", async () => ({
    ok: true,
    alerts: store.getRecentAlerts()
  }));

  app.get("/api/tiktok/oauth/callback", async (request, reply) => {
    const query = request.query as Record<string, string | undefined>;
    const code = query.code;

    if (!code || code === "null") {
      return reply.type("text/html").send(renderOAuthPage({
        title: "TikTok Shop authorization failed",
        body: `<p>No authorization code was returned. Error: ${escapeHtml(query.error ?? "unknown")}</p>`
      }));
    }

    if (!config.tiktokAppKey || !config.tiktokAppSecret) {
      return reply.type("text/html").send(renderOAuthPage({
        title: "TikTok Shop authorization failed",
        body: "<p>Missing TIKTOK_APP_KEY or TIKTOK_APP_SECRET on the server.</p>"
      }));
    }

    try {
      const options = {
        authBaseUrl: config.tiktokAuthBaseUrl,
        apiBaseUrl: config.tiktokApiBaseUrl,
        apiVersion: config.tiktokApiVersion,
        appKey: config.tiktokAppKey,
        appSecret: config.tiktokAppSecret
      };
      const token = await exchangeTikTokAuthCode(code, options);
      let shops: Array<{ id: string; cipher: string; name: string; region?: string; sellerType?: string }> = [];
      let shopsWarning: string | undefined;

      try {
        shops = await getTikTokAuthorizedShops(token.accessToken, options);
      } catch (error) {
        shopsWarning =
          error instanceof Error
            ? error.message
            : "Authorized shops lookup failed. The token may not include that scope.";
      }

      return reply.type("text/html").send(renderOAuthSuccessPage(token, shops, shopsWarning));
    } catch (error) {
      logger.error("tiktok oauth callback failed", {
        errorName: error instanceof Error ? error.name : "UnknownError"
      });

      return reply.type("text/html").send(renderOAuthPage({
        title: "TikTok Shop authorization failed",
        body: `<p>${escapeHtml(error instanceof Error ? error.message : "Unknown error")}</p>`
      }));
    }
  });

  app.get("/api/recent-webhooks", async (request, reply) => {
    if (!isAuthorizedDebugRequest(request.headers.authorization, config.overlayAllowedToken)) {
      return reply.status(401).send({ ok: false });
    }

    return {
      ok: true,
      webhooks: store.getRawWebhookEvents().map((event) => ({
        eventId: event.eventId,
        dedupeKey: event.dedupeKey,
        receivedAt: event.receivedAt,
        orderId: extractTikTokOrderId(event.payload as Record<string, unknown>),
        shopId: extractTikTokShopId(event.payload as Record<string, unknown>),
        orderStatus: extractTikTokOrderStatus(event.payload as Record<string, unknown>),
        topLevelKeys: listTopLevelKeys(event.payload)
      }))
    };
  });

  app.post("/webhooks/tiktok", async (request, reply) => {
    const rawBody = typeof request.body === "string" ? request.body : JSON.stringify(request.body ?? {});
    const verification = verifyTikTokWebhookSignature(rawBody, request.headers, {
      secret: config.tiktokWebhookSecret,
      allowLocalBypass: config.tiktokWebhookVerifyBypass
    });

    if (!verification.ok) {
      logger.warn("tiktok webhook rejected", { reason: verification.reason });
      return reply.status(401).send({ ok: false });
    }

    const parsedBody = parseJsonBody(rawBody);
    const parsed = tiktokWebhookPayloadSchema.safeParse(coerceTikTokWebhookPayload(parsedBody));

    if (!parsed.success) {
      logger.warn("tiktok webhook invalid payload", {
        contentType: request.headers["content-type"],
        payloadKind: describePayloadKind(parsedBody),
        bodyLength: rawBody.length,
        topLevelKeys: listTopLevelKeys(parsedBody)
      });
      return { ok: true, eventId: `invalid_${crypto.randomUUID()}` };
    }

    logger.info("tiktok webhook accepted", {
      contentType: request.headers["content-type"],
      payloadKind: describePayloadKind(parsedBody),
      topLevelKeys: listTopLevelKeys(parsedBody)
    });

    const eventId = extractTikTokEventId(parsed.data);
    const dedupeKey = buildTikTokDedupeKey(parsed.data, eventId);
    const orderId = extractTikTokOrderId(parsed.data);
    const shopId = extractTikTokShopId(parsed.data);
    const orderStatus = extractTikTokOrderStatus(parsed.data);

    if (store.hasDedupeKey(dedupeKey)) {
      logger.info("tiktok webhook duplicate ignored", {
        eventId,
        dedupeKey,
        orderId,
        shopId,
        orderStatus
      });
      return { ok: true, duplicate: true };
    }

    store.rememberDedupeKey(dedupeKey);
    store.addRawWebhookEvent({
      eventId,
      dedupeKey,
      receivedAt: new Date().toISOString(),
      payload: parsed.data
    });

    queueMicrotask(() => {
      void processTikTokWebhookEvent({
        payload: parsed.data,
        eventId,
        orderId,
        shopId,
        orderStatus,
        hasCredentials: config.hasTikTokCredentials,
        tiktokOrderClient,
        store,
        io
      });
    });

    return { ok: true, eventId };
  });

  app.setErrorHandler((error, _request, reply) => {
    const appError = error as Error & { statusCode?: number };
    logger.error("request failed", { errorName: appError.name, statusCode: appError.statusCode });
    reply.status(appError.statusCode ?? 500).send({ ok: false, error: "request failed" });
  });

  return { app, io, store };
}

function parseJsonBody(body: unknown): unknown {
  if (Buffer.isBuffer(body)) {
    return parseJsonBody(body.toString("utf8"));
  }

  if (typeof body !== "string") {
    return body;
  }

  return JSON.parse(body);
}

function coerceTikTokWebhookPayload(body: unknown): unknown {
  if (isRecord(body)) {
    return body;
  }

  if (Array.isArray(body)) {
    return {
      event_id: `array_${crypto.randomUUID()}`,
      event_type: "UNKNOWN_ARRAY_PAYLOAD",
      data: {
        eventCount: body.length
      }
    };
  }

  return body;
}

function describePayloadKind(body: unknown): string {
  if (Array.isArray(body)) {
    return "array";
  }

  if (body === null) {
    return "null";
  }

  return typeof body;
}

function listTopLevelKeys(body: unknown): string {
  if (!isRecord(body)) {
    return "";
  }

  return Object.keys(body).slice(0, 20).join(",");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAuthorizedDebugRequest(authorization: string | undefined, token: string): boolean {
  return authorization === `Bearer ${token}`;
}

function renderOAuthSuccessPage(
  token: {
    accessToken: string;
    accessTokenExpireIn?: number;
    refreshToken: string;
    refreshTokenExpireIn?: number;
    sellerName?: string;
    sellerBaseRegion?: string;
    grantedScopes: string[];
  },
  shops: Array<{ id: string; cipher: string; name: string; region?: string; sellerType?: string }>,
  shopsWarning?: string
): string {
  const primaryShop = shops[0];
  const envLines = [
    primaryShop ? `TIKTOK_SHOP_ID=${primaryShop.id}` : "TIKTOK_SHOP_ID=",
    primaryShop ? `TIKTOK_SHOP_CIPHER=${primaryShop.cipher}` : "TIKTOK_SHOP_CIPHER=",
    `TIKTOK_ACCESS_TOKEN=${token.accessToken}`,
    `TIKTOK_REFRESH_TOKEN=${token.refreshToken}`
  ].join("\n");
  const shopList = shops.length
    ? shops
        .map(
          (shop) =>
            `<li><strong>${escapeHtml(shop.name)}</strong><br/><code>TIKTOK_SHOP_ID=${escapeHtml(
              shop.id
            )}</code><br/><code>TIKTOK_SHOP_CIPHER=${escapeHtml(shop.cipher)}</code></li>`
        )
        .join("")
    : "<li>No authorized shops returned for this token.</li>";

  return renderOAuthPage({
    title: "TikTok Shop connected",
    body: `
      <p>Update these values in Render Environment Variables, then redeploy the server.</p>
      <pre>${escapeHtml(envLines)}</pre>
      <h2>Authorized seller</h2>
      <p><strong>${escapeHtml(token.sellerName ?? "Unknown seller")}</strong> ${escapeHtml(
        token.sellerBaseRegion ?? ""
      )}</p>
      <h2>Authorized shops</h2>
      ${
        shopsWarning
          ? `<p class="warning">Authorized shops lookup failed: ${escapeHtml(shopsWarning)}</p>`
          : ""
      }
      <ul>${shopList}</ul>
      <h2>Granted scopes</h2>
      <pre>${escapeHtml(token.grantedScopes.join("\n") || "No scopes returned")}</pre>
      <p class="warning">Treat access and refresh tokens like passwords. Do not share screenshots of this page publicly.</p>
    `
  });
}

function renderOAuthPage({ title, body }: { title: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      body { margin: 0; font-family: system-ui, sans-serif; background: #f7f7f8; color: #111827; }
      main { max-width: 1040px; margin: 8vh auto; padding: 0 24px; }
      h1 { font-size: 48px; margin: 0 0 28px; }
      h2 { margin-top: 28px; }
      pre { overflow: auto; padding: 24px; border-radius: 8px; background: #111827; color: #e5e7eb; font-size: 15px; line-height: 1.55; }
      code { color: #0f766e; overflow-wrap: anywhere; }
      li { margin: 14px 0; }
      .warning { color: #9f1239; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      ${body}
    </main>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createTikTokOrderClient(config: AppConfig): TikTokOrderClient {
  if (
    config.tiktokAppKey &&
    config.tiktokAppSecret &&
    config.tiktokAccessToken &&
    config.tiktokShopCipher
  ) {
    return new TikTokShopOrderClient({
      baseUrl: config.tiktokApiBaseUrl,
      authBaseUrl: config.tiktokAuthBaseUrl,
      apiVersion: config.tiktokApiVersion,
      appKey: config.tiktokAppKey,
      appSecret: config.tiktokAppSecret,
      accessToken: config.tiktokAccessToken,
      refreshToken: config.tiktokRefreshToken,
      shopCipher: config.tiktokShopCipher
    });
  }

  return new PlaceholderTikTokOrderClient();
}

async function processTikTokWebhookEvent({
  payload,
  eventId,
  orderId,
  shopId,
  orderStatus,
  hasCredentials,
  tiktokOrderClient,
  store,
  io
}: {
  payload: Record<string, unknown>;
  eventId: string;
  orderId: string | undefined;
  shopId: string | undefined;
  orderStatus: string | undefined;
  hasCredentials: boolean;
  tiktokOrderClient: TikTokOrderClient;
  store: InMemoryOrderStore;
  io: SocketIOServer;
}): Promise<void> {
  try {
    if (!shouldCreateAlertForTikTokStatus(orderStatus)) {
      logger.info("tiktok webhook ignored for non-new-order status", {
        eventId,
        orderId,
        shopId,
        orderStatus
      });
      return;
    }

    logger.info("tiktok order detail lookup started", {
      eventId,
      orderId,
      shopId,
      orderStatus,
      hasCredentials
    });

    const details = orderId ? await tiktokOrderClient.getOrderDetails(orderId) : undefined;
    const alert = details
      ? normalizeTikTokOrderDetailsAlert(details)
      : normalizeTikTokOrderAlert(payload);

    if (!alert) {
      logger.info("tiktok webhook stored without alert", {
        eventId,
        orderId,
        shopId,
        orderStatus,
        hasCredentials,
        hasOrderId: Boolean(orderId)
      });
      return;
    }

    store.addAlert(alert);
    io.emit("order:created", alert);
    logger.info("tiktok order alert created", {
      eventId,
      alertId: alert.id,
      orderId,
      shopId,
      orderStatus,
      source: alert.source,
      quantity: alert.quantity,
      tier: alert.tier
    });
  } catch (error) {
    if (error instanceof TikTokApiError) {
      logger.error("tiktok order detail lookup failed", {
        eventId,
        orderId,
        shopId,
        orderStatus,
        errorName: error.name,
        message: error.message,
        statusCode: error.statusCode,
        apiCode: error.apiCode,
        requestId: error.requestId
      });
      return;
    }

    logger.error("tiktok order detail lookup failed", {
      eventId,
      orderId,
      shopId,
      orderStatus,
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
  }
}
