import {
  calculateOrderTier,
  maskBuyerDisplayName,
  type OrderAlert
} from "@live-alerts/shared";
import type { TikTokWebhookPayload } from "./types.js";

type NormalizedFields = {
  orderId: string | undefined;
  buyerDisplayName: string | undefined;
  productTitle: string | undefined;
  quantity: number | undefined;
  imageUrl: string | undefined;
};

export function extractTikTokEventId(payload: TikTokWebhookPayload): string {
  return payload.event_id ?? payload.eventId ?? `raw_${crypto.randomUUID()}`;
}

export function extractTikTokOrderId(payload: TikTokWebhookPayload): string | undefined {
  const data = isRecord(payload.data) ? payload.data : {};
  const nestedOrderId = stringValue(data.order_id) ?? stringValue(data.orderId);

  return payload.order_id ?? payload.orderId ?? nestedOrderId;
}

export function buildTikTokDedupeKey(payload: TikTokWebhookPayload, eventId: string): string {
  const orderId = extractTikTokOrderId(payload);
  const status = payload.status ?? (isRecord(payload.data) ? stringValue(payload.data.status) : undefined);

  if (orderId) {
    return `order:${orderId}:${status ?? "unknown"}`;
  }

  return `event:${eventId}`;
}

export function normalizeTikTokOrderAlert(payload: TikTokWebhookPayload): OrderAlert | undefined {
  const data = isRecord(payload.data) ? payload.data : {};
  const maybeFields = pickDisplayFields(data);

  if (!maybeFields.productTitle || !maybeFields.quantity) {
    return undefined;
  }

  return {
    id: crypto.randomUUID(),
    source: "tiktok",
    orderId: maybeFields.orderId ?? extractTikTokOrderId(payload),
    buyerDisplayName: maskBuyerDisplayName(maybeFields.buyerDisplayName),
    productTitle: maybeFields.productTitle,
    quantity: maybeFields.quantity,
    imageUrl: maybeFields.imageUrl,
    createdAt: new Date().toISOString(),
    tier: calculateOrderTier(maybeFields.quantity)
  };
}

function pickDisplayFields(data: Record<string, unknown>): NormalizedFields {
  return {
    orderId: stringValue(data.order_id) ?? stringValue(data.orderId),
    buyerDisplayName:
      stringValue(data.buyerDisplayName) ??
      stringValue(data.buyer_display_name) ??
      stringValue(data.username),
    productTitle:
      stringValue(data.productTitle) ??
      stringValue(data.product_title) ??
      stringValue(data.sku_name) ??
      stringValue(data.item_name),
    quantity: numberValue(data.quantity) ?? numberValue(data.qty),
    imageUrl: stringValue(data.imageUrl) ?? stringValue(data.image_url)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}
