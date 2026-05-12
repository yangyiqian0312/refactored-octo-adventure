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

    if (store.hasDedupeKey(dedupeKey)) {
      logger.info("tiktok webhook duplicate ignored", { eventId, dedupeKey });
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

function createTikTokOrderClient(config: AppConfig): TikTokOrderClient {
  if (
    config.tiktokAppKey &&
    config.tiktokAppSecret &&
    config.tiktokAccessToken &&
    config.tiktokShopCipher
  ) {
    return new TikTokShopOrderClient({
      baseUrl: config.tiktokApiBaseUrl,
      appKey: config.tiktokAppKey,
      appSecret: config.tiktokAppSecret,
      accessToken: config.tiktokAccessToken,
      shopCipher: config.tiktokShopCipher
    });
  }

  return new PlaceholderTikTokOrderClient();
}

async function processTikTokWebhookEvent({
  payload,
  eventId,
  hasCredentials,
  tiktokOrderClient,
  store,
  io
}: {
  payload: Record<string, unknown>;
  eventId: string;
  hasCredentials: boolean;
  tiktokOrderClient: TikTokOrderClient;
  store: InMemoryOrderStore;
  io: SocketIOServer;
}): Promise<void> {
  try {
    const orderId = extractTikTokOrderId(payload);
    const orderStatus = extractTikTokOrderStatus(payload);

    if (!shouldCreateAlertForTikTokStatus(orderStatus)) {
      logger.info("tiktok webhook ignored for non-new-order status", {
        eventId,
        hasOrderId: Boolean(orderId),
        orderStatus
      });
      return;
    }

    const details = orderId ? await tiktokOrderClient.getOrderDetails(orderId) : undefined;
    const alert = details
      ? normalizeTikTokOrderDetailsAlert(details)
      : normalizeTikTokOrderAlert(payload);

    if (!alert) {
      logger.info("tiktok webhook stored without alert", {
        eventId,
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
      source: alert.source,
      quantity: alert.quantity,
      tier: alert.tier
    });
  } catch (error) {
    if (error instanceof TikTokApiError) {
      logger.error("tiktok order detail lookup failed", {
        eventId,
        errorName: error.name,
        statusCode: error.statusCode,
        apiCode: error.apiCode,
        requestId: error.requestId
      });
      return;
    }

    logger.error("tiktok order detail lookup failed", {
      eventId,
      errorName: error instanceof Error ? error.name : "UnknownError"
    });
  }
}
