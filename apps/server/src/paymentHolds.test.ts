import { describe, expect, it } from "vitest";
import { PaymentHoldStore, paymentHoldStatus, webhookUpdateTime } from "./paymentHolds.js";

describe("payment holds", () => {
  it("does not label unpaid/cancelled/unknown orders as failed payments", () => {
    expect(paymentHoldStatus("UNPAID")).toBe("unpaid");
    expect(paymentHoldStatus("PAYMENT_FAILED")).toBe("payment_failed");
    expect(paymentHoldStatus("CANCELLED")).toBeUndefined();
    expect(paymentHoldStatus("UNKNOWN")).toBeUndefined();
  });

  it("removes a paid hold and ignores stale unpaid events or late details", () => {
    const store = new PaymentHoldStore();
    store.update("1", "UNPAID", 1000);
    store.enrich("1", 1000, { warehouseId: "a", productTitle: "Pack" });
    expect(store.list()[0]?.warehouseId).toBe("a");
    store.update("1", "AWAITING_SHIPMENT", 2000);
    store.enrich("1", 1000, { warehouseId: "b" });
    expect(store.update("1", "UNPAID", 1000)).toBe(false);
    expect(store.list()).toEqual([]);
  });

  it("deduplicates holds and accepts transitions within the same timestamp second", () => {
    const store = new PaymentHoldStore();
    store.update("1", "UNPAID", 1000);
    store.update("1", "UNPAID", 1000);
    expect(store.list()).toHaveLength(1);
    store.update("1", "AWAITING_SHIPMENT", 1000);
    expect(store.list()).toEqual([]);
    expect(webhookUpdateTime({ data: { update_time: 1720000000 } })).toBe(1720000000000);
  });
});
