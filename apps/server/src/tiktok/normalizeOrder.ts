import {
  calculateOrderTier,
  maskBuyerDisplayName,
  type OrderAlert
} from "@live-alerts/shared";
import type { TikTokOrderDetails } from "./client.js";
import type { TikTokWebhookPayload } from "./types.js";

type NormalizedFields = {
  orderId: string | undefined;
  buyerDisplayName: string | undefined;
  productTitle: string | undefined;
  quantity: number | undefined;
  imageUrl: string | undefined;
  orderTotalAmount: number | undefined;
  orderTotalCurrency: string | undefined;
};

export function extractTikTokEventId(payload: TikTokWebhookPayload): string {
  return (
    stringValue(payload.event_id) ??
    stringValue(payload.eventId) ??
    stringValue(payload.tts_notification_id) ??
    stringValue(payload.notification_id) ??
    stringValue(payload.event) ??
    `raw_${crypto.randomUUID()}`
  );
}

export function extractTikTokOrderId(payload: TikTokWebhookPayload): string | undefined {
  const data = isRecord(payload.data) ? payload.data : {};
  const nestedOrderId =
    stringValue(data.order_id) ??
    stringValue(data.orderId) ??
    stringValue(data.order_sn) ??
    stringValue(data.orderSn) ??
    stringValue(data.order_id_list) ??
    firstString(data.order_id_list) ??
    firstString(data.orderIdList);

  return (
    stringValue(payload.order_id) ??
    stringValue(payload.orderId) ??
    stringValue(payload.order_sn) ??
    stringValue(payload.orderSn) ??
    nestedOrderId
  );
}

export function extractTikTokShopId(payload: TikTokWebhookPayload): string | undefined {
  return stringValue(payload.shop_id) ?? stringValue(payload.shopId);
}

export function buildTikTokDedupeKey(payload: TikTokWebhookPayload, eventId: string): string {
  const orderId = extractTikTokOrderId(payload);
  const status =
    stringValue(payload.status) ??
    stringValue(payload.order_status) ??
    (isRecord(payload.data)
      ? stringValue(payload.data.status) ?? stringValue(payload.data.order_status)
      : undefined);

  if (orderId) {
    return `order:${orderId}:${status ?? "unknown"}`;
  }

  return `event:${eventId}`;
}

export function extractTikTokOrderStatus(payload: TikTokWebhookPayload): string | undefined {
  return (
    stringValue(payload.status) ??
    stringValue(payload.order_status) ??
    (isRecord(payload.data)
      ? stringValue(payload.data.status) ?? stringValue(payload.data.order_status)
      : undefined)
  );
}

export function shouldCreateAlertForTikTokStatus(status: string | undefined): boolean {
  return status?.toUpperCase() === "AWAITING_SHIPMENT";
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
    orderTotalAmount: maybeFields.orderTotalAmount,
    orderTotalCurrency: maybeFields.orderTotalCurrency,
    createdAt: new Date().toISOString(),
    tier: calculateOrderTier(maybeFields.quantity)
  };
}

export function normalizeTikTokOrderDetailsAlert(details: TikTokOrderDetails): OrderAlert {
  return {
    id: crypto.randomUUID(),
    source: "tiktok",
    orderId: details.orderId,
    buyerDisplayName: maskBuyerDisplayName(details.buyerDisplayName),
    productTitle: details.productTitle,
    quantity: details.quantity,
    imageUrl: details.imageUrl,
    orderTotalAmount: details.orderTotalAmount,
    orderTotalCurrency: details.orderTotalCurrency,
    createdAt: new Date().toISOString(),
    tier: calculateOrderTier(details.quantity)
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
    imageUrl: stringValue(data.imageUrl) ?? stringValue(data.image_url),
    orderTotalAmount:
      moneyValue(data.orderTotalAmount) ??
      moneyValue(data.order_total_amount) ??
      moneyValue(data.totalAmount) ??
      moneyValue(data.total_amount),
    orderTotalCurrency:
      stringValue(data.orderTotalCurrency) ??
      stringValue(data.order_total_currency) ??
      stringValue(data.currency)
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

function moneyValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }

  return undefined;
}

function firstString(value: unknown): string | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  return value.map(stringValue).find((item): item is string => Boolean(item));
}
