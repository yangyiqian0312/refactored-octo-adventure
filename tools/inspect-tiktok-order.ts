import { signTikTokRequest } from "../apps/server/src/tiktok/signRequest.js";

const orderId = process.argv[2];

if (!orderId) {
  throw new Error("Usage: tsx tools/inspect-tiktok-order.ts <order-id>");
}

const appKey = requiredEnv("TIKTOK_APP_KEY");
const appSecret = requiredEnv("TIKTOK_APP_SECRET");
let accessToken = requiredEnv("TIKTOK_ACCESS_TOKEN");
const refreshToken = process.env.TIKTOK_REFRESH_TOKEN;
const apiVersion = process.env.TIKTOK_API_VERSION || "202309";
const baseUrl = process.env.TIKTOK_API_BASE_URL || "https://open-api.tiktokglobalshop.com";
const shopCipher = process.env.TIKTOK_SHOP_CIPHER;
const shopId = process.env.TIKTOK_SHOP_ID;

const path = `/order/${apiVersion}/orders`;
const timestamp = Math.floor(Date.now() / 1000);
const query = {
  app_key: appKey,
  ids: orderId,
  timestamp,
  version: apiVersion,
  ...(shopCipher ? { shop_cipher: shopCipher } : { shop_id: shopId ?? "" })
};
const sign = signTikTokRequest({ path, query, appSecret });
const url = new URL(path, baseUrl);

for (const [key, value] of Object.entries({ ...query, sign })) {
  url.searchParams.set(key, String(value));
}

let response = await fetchOrder(url, accessToken);
let json = await response.json() as Record<string, unknown>;

if (json.code === 105002 && refreshToken) {
  accessToken = await refreshAccessToken(refreshToken);
  response = await fetchOrder(url, accessToken);
  json = await response.json() as Record<string, unknown>;
}

const data = isRecord(json.data) ? json.data : {};
const orders = Array.isArray(data.orders) ? data.orders.filter(isRecord) : [];
const order = orders[0] ?? {};
const lineItems = Array.isArray(order.line_items) ? order.line_items.filter(isRecord) : [];
const firstLineItem = lineItems[0] ?? {};

console.log(JSON.stringify({
  httpStatus: response.status,
  code: json.code,
  message: json.message,
  requestId: json.request_id,
  orderCount: orders.length,
  dataKeys: Object.keys(data).slice(0, 80),
  orderKeys: Object.keys(order).slice(0, 160),
  lineItemKeys: Object.keys(firstLineItem).slice(0, 120),
  possibleSourceFields: collectPossibleSourceFields(order),
  possibleLineItemSourceFields: collectPossibleSourceFields(firstLineItem)
}, null, 2));

function requiredEnv(key: string): string {
  const value = process.env[key];

  if (!value) {
    throw new Error(`${key} is required`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function collectPossibleSourceFields(record: Record<string, unknown>): Record<string, unknown> {
  const sourcePattern = /(source|channel|live|creator|room|auction|affiliate|content|commerce|platform|order_type|type)/i;
  const safe: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record)) {
    if (!sourcePattern.test(key)) {
      continue;
    }

    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      safe[key] = value;
    } else if (Array.isArray(value)) {
      safe[key] = `[array:${value.length}]`;
    } else if (isRecord(value)) {
      safe[key] = `[object keys:${Object.keys(value).slice(0, 20).join(",")}]`;
    }
  }

  return safe;
}

function fetchOrder(url: URL, token: string): Promise<Response> {
  return fetch(url, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      "x-tts-access-token": token
    }
  });
}

async function refreshAccessToken(token: string): Promise<string> {
  const authBaseUrl = process.env.TIKTOK_AUTH_BASE_URL || "https://auth.tiktok-shops.com";
  const url = new URL("/api/v2/token/refresh", authBaseUrl);

  url.searchParams.set("app_key", appKey);
  url.searchParams.set("app_secret", appSecret);
  url.searchParams.set("refresh_token", token);
  url.searchParams.set("grant_type", "refresh_token");

  const response = await fetch(url, { method: "GET" });
  const json = await response.json() as Record<string, unknown>;
  const data = isRecord(json.data) ? json.data : {};
  const nextAccessToken = typeof data.access_token === "string" ? data.access_token : undefined;

  if (!response.ok || json.code !== 0 || !nextAccessToken) {
    throw new Error(`Token refresh failed: ${String(json.message ?? response.status)}`);
  }

  return nextAccessToken;
}
