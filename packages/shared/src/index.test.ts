import { describe, expect, it } from "vitest";
import { calculateOrderTier, labelPrintJobSchema, orderAlertSchema } from "./index.js";

describe("OrderAlert schema", () => {
  it("accepts a valid alert", () => {
    const alert = orderAlertSchema.parse({
      id: "evt_123",
      source: "test",
      buyerDisplayName: "m***23",
      productTitle: "Pokemon Booster Pack",
      quantity: 3,
      imageUrl: "https://placehold.co/300x300",
      orderTotalAmount: 240,
      orderTotalCurrency: "USD",
      createdAt: new Date().toISOString(),
      tier: "large"
    });

    expect(alert.productTitle).toBe("Pokemon Booster Pack");
    expect(alert.orderTotalAmount).toBe(240);
  });

  it("rejects non-positive quantities", () => {
    expect(() =>
      orderAlertSchema.parse({
        id: "evt_123",
        source: "test",
        buyerDisplayName: "m***23",
        productTitle: "Pokemon Booster Pack",
        quantity: 0,
        createdAt: new Date().toISOString(),
        tier: "normal"
      })
    ).toThrow();
  });
});

describe("calculateOrderTier", () => {
  it.each([
    [1, "normal"],
    [2, "normal"],
    [3, "large"],
    [9, "large"],
    [10, "mega"],
    [25, "mega"]
  ] as const)("maps %s to %s", (quantity, tier) => {
    expect(calculateOrderTier(quantity)).toBe(tier);
  });
});

describe("LabelPrintJob schema", () => {
  it("accepts a valid safe label print job", () => {
    const job = labelPrintJobSchema.parse({
      id: "print_123",
      storeId: "store2",
      shopId: "7495210574874380572",
      orderId: "577387538643456175",
      skuName: "ME03 Perfect Order",
      productName: "Pokemon Booster Pack",
      buyerNickname: "buyer123",
      productPaidAmount: 30,
      productPaidCurrency: "USD",
      createdAt: new Date().toISOString()
    });

    expect(job.shopId).toBe("7495210574874380572");
    expect(job.productPaidAmount).toBe(30);
  });
});
