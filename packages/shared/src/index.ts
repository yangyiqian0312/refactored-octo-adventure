import { z } from "zod";

export const orderAlertTierSchema = z.enum(["normal", "large", "mega"]);

export const orderAlertSchema = z.object({
  id: z.string().min(1),
  source: z.enum(["test", "tiktok"]),
  orderId: z.string().min(1).optional(),
  buyerDisplayName: z.string().min(1).default("Someone"),
  productTitle: z.string().min(1),
  quantity: z.number().int().positive(),
  imageUrl: z.string().url().optional(),
  orderTotalAmount: z.number().nonnegative().optional(),
  orderTotalCurrency: z.string().trim().min(1).max(12).optional(),
  createdAt: z.string().datetime(),
  tier: orderAlertTierSchema
});

export const orderQueueItemSchema = z.object({
  orderId: z.string().min(1),
  buyerDisplayName: z.string().min(1).default("Someone"),
  productTitle: z.string().min(1).optional(),
  quantity: z.number().int().positive().optional(),
  status: z.string().min(1),
  updatedAt: z.string().datetime()
});

export const testOrderRequestSchema = z.object({
  buyerName: z.string().trim().min(1).max(64).optional(),
  productTitle: z.string().trim().min(1).max(160),
  quantity: z.number().int().positive().max(999),
  imageUrl: z.string().url().optional(),
  orderTotalAmount: z.number().nonnegative().optional(),
  orderTotalCurrency: z.string().trim().min(1).max(12).optional()
});

export type OrderAlertTier = z.infer<typeof orderAlertTierSchema>;
export type OrderAlert = z.infer<typeof orderAlertSchema>;
export type OrderQueueItem = z.infer<typeof orderQueueItemSchema>;
export type TestOrderRequest = z.infer<typeof testOrderRequestSchema>;

export function calculateOrderTier(quantity: number): OrderAlertTier {
  if (quantity >= 10) {
    return "mega";
  }

  if (quantity >= 3) {
    return "large";
  }

  return "normal";
}

export function maskBuyerDisplayName(value: string | undefined): string {
  const fallback = "Someone";
  const trimmed = value?.trim();

  if (!trimmed) {
    return fallback;
  }

  if (trimmed.includes("@") || /\d{7,}/.test(trimmed)) {
    return fallback;
  }

  return trimmed.slice(0, 64);
}
