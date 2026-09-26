import { z } from "zod";

export const paymentHoldSchema = z.object({
  orderId: z.string().min(1),
  warehouseId: z.string().optional(),
  buyerDisplayName: z.string().default("Someone"),
  productTitle: z.string().optional(),
  skuName: z.string().optional(),
  status: z.enum(["unpaid", "payment_failed"]),
  rawStatus: z.string(),
  updatedAt: z.string().datetime()
});
export type PaymentHold = z.infer<typeof paymentHoldSchema>;

export const printContextSchema = z.object({
  shopId: z.string().optional(),
  storeId: z.string().optional(),
  warehouses: z.array(z.object({ id: z.string().min(1), name: z.string().min(1) })),
  paymentHolds: z.array(paymentHoldSchema)
});
export type PrintContext = z.infer<typeof printContextSchema>;

export const printIdentitySchema = z.object({
  ok: z.literal(true),
  shopId: z.string().min(1),
  storeId: z.string().min(1),
  warehouses: printContextSchema.shape.warehouses
});
export const legacyPrintIdentitySchema = z.object({
  ok: z.literal(true),
  webhooks: z.array(z.object({ shopId: z.string().optional() }))
});
export const printSelectionSchema = z.object({
  profileId: z.string().min(1),
  warehouseId: z.string().min(1)
});

export const printRowSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  warehouseId: z.string(),
  pickCode: z.string(),
  buyerDisplayName: z.string(),
  productTitle: z.string(),
  status: z.enum(["queued", "printing", "submitted", "preview", "failed", "fixed"]),
  updatedAt: z.string().datetime(),
  error: z.string().optional()
});
export type PrintRow = z.infer<typeof printRowSchema>;

export function printUsername(value: string | undefined): string {
  const username = value?.trim().replace(/^@/, "") ?? "";
  return username !== "Someone" &&
    /^[a-zA-Z0-9._]{1,64}$/.test(username) &&
    !/\d{7,}/.test(username)
    ? `@${username}`
    : "Someone";
}

export function holdPrintNumber(hold: Pick<PaymentHold, "productTitle" | "skuName">): string {
  if (!hold.skuName) return "—";
  const series = hold.productTitle?.trim().match(/^([A-Z])(?:\s|$)/)?.[1];
  const number = hold.skuName.trim().replace(/^#+\s*/, "");
  return series && !/^[A-Z]\s*\d/i.test(number) ? `${series} ${number}` : number;
}

export const printConsoleStateSchema = z.object({
  selectedProfileId: z.string().default(""),
  switchingStore: z.boolean().default(false),
  shopProfiles: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        warehouses: printContextSchema.shape.warehouses
      })
    )
    .default([]),
  connection: z.enum(["connecting", "connected", "disconnected", "error"]),
  connectionError: z.string().optional(),
  contextAvailable: z.boolean(),
  dryRun: z.boolean(),
  paused: z.boolean(),
  selectedWarehouseId: z.string(),
  warehouses: printContextSchema.shape.warehouses,
  current: printRowSchema.nullable(),
  latest: printRowSchema.nullable(),
  lastPrintedByWarehouse: z.record(printRowSchema).default({}),
  queue: z.array(printRowSchema),
  history: z.array(printRowSchema),
  paymentHolds: z.array(paymentHoldSchema)
});
export type PrintConsoleState = z.infer<typeof printConsoleStateSchema>;

export const printConsoleSettingsSchema = z
  .object({
    profileId: z.string().min(1).optional(),
    warehouseId: z.string().min(1).optional(),
    paused: z.boolean().optional()
  })
  .strict();
