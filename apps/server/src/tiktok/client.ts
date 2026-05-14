import { z } from "zod";
import { signTikTokRequest } from "./signRequest.js";

export type TikTokOrderDetails = {
  orderId: string;
  buyerDisplayName?: string;
  productTitle: string;
  quantity: number;
  imageUrl?: string;
  orderTotalAmount?: number;
  orderTotalCurrency?: string;
};

export type TikTokOrderDetailShape = {
  dataKeys: string;
  orderKeys: string;
  lineItemKeys: string;
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
  getLastOrderDetailShape(): TikTokOrderDetailShape | undefined;
}

export class PlaceholderTikTokOrderClient implements TikTokOrderClient {
  async getOrderDetails(_orderId: string): Promise<TikTokOrderDetails | undefined> {
    return undefined;
  }

  getLastOrderDetailShape(): TikTokOrderDetailShape | undefined {
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
  private lastOrderDetailShape: TikTokOrderDetailShape | undefined;

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

  getLastOrderDetailShape(): TikTokOrderDetailShape | undefined {
    return this.lastOrderDetailShape;
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
    this.lastOrderDetailShape = describeOrderDetailShape(parsed.data);

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
  const lineItems =
    arrayValue(order.line_items) ??
    arrayValue(order.lineItems) ??
    arrayValue(order.items) ??
    arrayValue(order.skus);
  const firstLineItem = lineItems?.find(isRecord) ?? order;

  if (!firstLineItem) {
    return undefined;
  }

  const productTitle =
    stringValue(order.product_name) ??
    stringValue(order.productName) ??
    stringValue(order.product_title) ??
    stringValue(order.productTitle) ??
    stringValue(firstLineItem.product_name) ??
    stringValue(firstLineItem.productName) ??
    stringValue(firstLineItem.product_title) ??
    stringValue(firstLineItem.productTitle) ??
    stringValue(firstLineItem.sku_name) ??
    stringValue(firstLineItem.skuName) ??
    stringValue(firstLineItem.seller_sku) ??
    stringValue(firstLineItem.name);
  const quantity =
    numberValue(order.quantity) ??
    numberValue(order.qty) ??
    numberValue(firstLineItem.quantity) ??
    numberValue(firstLineItem.qty) ??
    numberValue(firstLineItem.item_quantity) ??
    numberValue(firstLineItem.product_quantity) ??
    1;

  if (!productTitle || !quantity) {
    return undefined;
  }

  const details: TikTokOrderDetails = {
    orderId,
    productTitle,
    quantity
  };

  const buyerInfo =
    recordValue(order.buyer_info) ??
    recordValue(order.buyerInfo) ??
    recordValue(order.buyer) ??
    recordValue(order.user);
  const buyerDisplayName =
    stringValue(order.buyer_user_name) ??
    stringValue(order.buyer_username) ??
    stringValue(order.buyerUsername) ??
    stringValue(order.buyer_display_name) ??
    stringValue(order.buyerDisplayName) ??
    stringValue(order.buyer_nickname) ??
    stringValue(order.buyerNickname) ??
    stringValue(order.username) ??
    stringValue(order.user_name) ??
    stringValue(order.userName) ??
    (buyerInfo
      ? stringValue(buyerInfo.username) ??
        stringValue(buyerInfo.user_name) ??
        stringValue(buyerInfo.userName) ??
        stringValue(buyerInfo.nickname) ??
        stringValue(buyerInfo.display_name) ??
        stringValue(buyerInfo.displayName)
      : undefined);
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

  const paymentInfo =
    recordValue(order.payment) ??
    recordValue(order.payment_info) ??
    recordValue(order.paymentInfo) ??
    recordValue(order.price_detail) ??
    recordValue(order.priceDetail);
  const orderTotalAmount =
    moneyValue(order.total_amount) ??
    moneyValue(order.totalAmount) ??
    moneyValue(order.order_amount) ??
    moneyValue(order.orderAmount) ??
    moneyValue(order.paid_amount) ??
    moneyValue(order.paidAmount) ??
    moneyValue(order.payment_amount) ??
    moneyValue(order.paymentAmount) ??
    (paymentInfo
      ? moneyValue(paymentInfo.total_amount) ??
        moneyValue(paymentInfo.totalAmount) ??
        moneyValue(paymentInfo.order_amount) ??
        moneyValue(paymentInfo.orderAmount) ??
        moneyValue(paymentInfo.paid_amount) ??
        moneyValue(paymentInfo.paidAmount) ??
        moneyValue(paymentInfo.payment_amount) ??
        moneyValue(paymentInfo.paymentAmount)
      : undefined);
  const orderTotalCurrency =
    stringValue(order.currency) ??
    stringValue(order.currency_code) ??
    stringValue(order.currencyCode) ??
    (paymentInfo
      ? stringValue(paymentInfo.currency) ??
        stringValue(paymentInfo.currency_code) ??
        stringValue(paymentInfo.currencyCode)
      : undefined);

  if (orderTotalAmount !== undefined) {
    details.orderTotalAmount = orderTotalAmount;
  }

  if (orderTotalCurrency) {
    details.orderTotalCurrency = orderTotalCurrency;
  }

  return details;
}

function describeOrderDetailShape(data: unknown): TikTokOrderDetailShape {
  const dataRecord = isRecord(data) ? data : {};
  const orders = arrayValue(dataRecord.orders);
  const order = orders?.find(isRecord);
  const lineItems =
    (order
      ? arrayValue(order.line_items) ??
        arrayValue(order.lineItems) ??
        arrayValue(order.items) ??
        arrayValue(order.skus)
      : undefined) ?? [];
  const lineItem = lineItems.find(isRecord);

  return {
    dataKeys: Object.keys(dataRecord).slice(0, 40).join(","),
    orderKeys: order ? Object.keys(order).slice(0, 80).join(",") : "",
    lineItemKeys: lineItem ? Object.keys(lineItem).slice(0, 80).join(",") : ""
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function arrayValue(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
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

function moneyValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.replace(/,/g, "").trim();
    const parsed = Number(normalized);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }

  if (isRecord(value)) {
    return (
      moneyValue(value.amount) ??
      moneyValue(value.value) ??
      moneyValue(value.total_amount) ??
      moneyValue(value.totalAmount)
    );
  }

  return undefined;
}
