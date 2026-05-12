import { z } from "zod";
import { signTikTokRequest } from "./signRequest.js";

export type TikTokOrderDetails = {
  orderId: string;
  buyerDisplayName?: string;
  productTitle: string;
  quantity: number;
  imageUrl?: string;
};

export type TikTokShopOrderClientOptions = {
  baseUrl: string;
  appKey: string;
  appSecret: string;
  accessToken: string;
  shopCipher: string;
};

export interface TikTokOrderClient {
  getOrderDetails(orderId: string): Promise<TikTokOrderDetails | undefined>;
}

export class PlaceholderTikTokOrderClient implements TikTokOrderClient {
  async getOrderDetails(_orderId: string): Promise<TikTokOrderDetails | undefined> {
    return undefined;
  }
}

const orderDetailResponseSchema = z
  .object({
    code: z.number().optional(),
    message: z.string().optional(),
    request_id: z.string().optional(),
    data: z
      .object({
        orders: z.array(z.record(z.string(), z.unknown())).optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

export class TikTokShopOrderClient implements TikTokOrderClient {
  constructor(private readonly options: TikTokShopOrderClientOptions) {}

  async getOrderDetails(orderId: string): Promise<TikTokOrderDetails | undefined> {
    const path = "/order/202309/orders";
    const timestamp = Math.floor(Date.now() / 1000);
    const query = {
      app_key: this.options.appKey,
      ids: orderId,
      shop_cipher: this.options.shopCipher,
      timestamp
    };
    const sign = signTikTokRequest({
      path,
      query,
      appSecret: this.options.appSecret
    });
    const url = new URL(path, this.options.baseUrl);

    for (const [key, value] of Object.entries({ ...query, sign })) {
      url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "content-type": "application/json",
        "x-tts-access-token": this.options.accessToken
      }
    });

    if (!response.ok) {
      throw new Error(`TikTok Order Detail API failed with HTTP ${response.status}`);
    }

    const parsed = orderDetailResponseSchema.parse(await response.json());
    const order = parsed.data?.orders?.[0];

    return order ? normalizeOrderDetail(orderId, order) : undefined;
  }
}

function normalizeOrderDetail(orderId: string, order: Record<string, unknown>): TikTokOrderDetails | undefined {
  const lineItems = arrayValue(order.line_items) ?? arrayValue(order.lineItems) ?? arrayValue(order.items);
  const firstLineItem = lineItems?.find(isRecord);

  if (!firstLineItem) {
    return undefined;
  }

  const productTitle =
    stringValue(firstLineItem.product_name) ??
    stringValue(firstLineItem.productName) ??
    stringValue(firstLineItem.sku_name) ??
    stringValue(firstLineItem.skuName) ??
    stringValue(firstLineItem.name);
  const quantity =
    numberValue(firstLineItem.quantity) ??
    numberValue(firstLineItem.qty) ??
    numberValue(firstLineItem.item_quantity);

  if (!productTitle || !quantity) {
    return undefined;
  }

  const details: TikTokOrderDetails = {
    orderId,
    productTitle,
    quantity
  };

  const buyerDisplayName =
    stringValue(order.buyer_user_name) ??
    stringValue(order.buyerUsername) ??
    stringValue(order.buyer_display_name);
  const imageUrl =
    stringValue(firstLineItem.sku_image) ??
    stringValue(firstLineItem.skuImage) ??
    stringValue(firstLineItem.product_image) ??
    stringValue(firstLineItem.image_url);

  if (buyerDisplayName) {
    details.buyerDisplayName = buyerDisplayName;
  }

  if (imageUrl) {
    details.imageUrl = imageUrl;
  }

  return details;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
  }

  return undefined;
}
