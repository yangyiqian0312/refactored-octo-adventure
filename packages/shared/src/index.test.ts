import { describe, expect, it } from "vitest";
import { calculateOrderTier, orderAlertSchema } from "./index.js";

describe("OrderAlert schema", () => {
  it("accepts a valid alert", () => {
    const alert = orderAlertSchema.parse({
      id: "evt_123",
      source: "test",
      buyerDisplayName: "m***23",
      productTitle: "Pokemon Booster Pack",
      quantity: 3,
      imageUrl: "https://placehold.co/300x300",
      createdAt: new Date().toISOString(),
      tier: "large"
    });

    expect(alert.productTitle).toBe("Pokemon Booster Pack");
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
