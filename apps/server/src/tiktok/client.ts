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
  authBaseUrl: string;
  apiVersion: string;
  appKey: string;
  appSecret: string;
  accessToken: string;
  refreshToken: string | undefined;
  shopId: string | undefined;
  shopCipher: string;
};

export class TikTokApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly apiCode?: number,
    readonly requestId?: string
  ) {
    super(message);
    this.name = "TikTokApiError";
  }
}

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
  private accessToken: string;
  private refreshToken: string | undefined;

  constructor(private readonly options: TikTokShopOrderClientOptions) {
    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken;
  }

  async getOrderDetails(orderId: string): Promise<TikTokOrderDetails | undefined> {
    try {
      return await this.fetchOrderDetails(orderId);
    } catch (error) {
      if (!(error instanceof TikTokApiError) || !this.refreshToken) {
        throw error;
      }

      await this.refreshAccessToken();
      return this.fetchOrderDetails(orderId);
    }
  }

  private async fetchOrderDetails(orderId: string): Promise<TikTokOrderDetails | undefined> {
    const path = `/order/${this.options.apiVersion}/orders`;
    const timestamp = Math.floor(Date.now() / 1000);
    const query = {
      app_key: this.options.appKey,
      ids: orderId,
      timestamp,
      version: this.options.apiVersion
    };
    const signedQuery = {
      ...query,
      ...(this.options.shopCipher
        ? { shop_cipher: this.options.shopCipher }
        : { shop_id: this.options.shopId ?? "" })
    };
    const sign = signTikTokRequest({
      path,
      query: signedQuery,
      appSecret: this.options.appSecret
    });
    const url = new URL(path, this.options.baseUrl);

    for (const [key, value] of Object.entries({ ...signedQuery, sign })) {
      url.searchParams.set(key, String(value));
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "content-type": "application/json",
        "x-tts-access-token": this.accessToken
      }
    });

    const responseJson = await response.json();
    const parsed = orderDetailResponseSchema.parse(responseJson);

    if (!response.ok || (parsed.code !== undefined && parsed.code !== 0)) {
      throw new TikTokApiError(
        parsed.message ?? `TikTok Order Detail API failed with HTTP ${response.status}`,
        response.status,
        parsed.code,
        parsed.request_id
      );
    }

    const order = parsed.data?.orders?.[0];

    return order ? normalizeOrderDetail(orderId, order) : undefined;
  }

  private async refreshAccessToken(): Promise<void> {
    const url = new URL("/api/v2/token/refresh", this.options.authBaseUrl);

    url.searchParams.set("app_key", this.options.appKey);
    url.searchParams.set("app_secret", this.options.appSecret);
    url.searchParams.set("refresh_token", this.refreshToken ?? "");
    url.searchParams.set("grant_type", "refresh_token");

    const response = await fetch(url, { method: "GET" });
    const parsed = tokenRefreshResponseSchema.parse(await response.json());

    if (!response.ok || parsed.code !== 0 || !parsed.data?.access_token) {
      throw new TikTokApiError(
        parsed.message ?? `TikTok token refresh failed with HTTP ${response.status}`,
        response.status,
        parsed.code,
        parsed.request_id
      );
    }

    this.accessToken = parsed.data.access_token;

    if (parsed.data.refresh_token) {
      this.refreshToken = parsed.data.refresh_token;
    }
  }
}

const tokenRefreshResponseSchema = z
  .object({
    code: z.number(),
    message: z.string().optional(),
    request_id: z.string().optional(),
    data: z
      .object({
        access_token: z.string().optional(),
        refresh_token: z.string().optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

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
