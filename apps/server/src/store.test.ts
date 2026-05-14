import { describe, expect, it } from "vitest";
import { InMemoryOrderStore } from "./store.js";

describe("InMemoryOrderStore dedupe", () => {
  it("remembers dedupe keys", () => {
    const store = new InMemoryOrderStore();

    expect(store.hasDedupeKey("order:123:paid")).toBe(false);
    store.rememberDedupeKey("order:123:paid");
    expect(store.hasDedupeKey("order:123:paid")).toBe(true);
  });
});

describe("InMemoryOrderStore queue controls", () => {
  it("shifts the oldest pending order", () => {
    const store = new InMemoryOrderStore();

    store.upsertPendingOrder({
      orderId: "order_2",
      buyerDisplayName: "second",
      status: "AWAITING_SHIPMENT",
      updatedAt: "2026-05-14T10:00:02.000Z"
    });
    store.upsertPendingOrder({
      orderId: "order_1",
      buyerDisplayName: "first",
      status: "AWAITING_SHIPMENT",
      updatedAt: "2026-05-14T10:00:01.000Z"
    });

    expect(store.shiftPendingOrder()?.orderId).toBe("order_1");
    expect(store.getPendingOrders().map((order) => order.orderId)).toEqual(["order_2"]);
  });

  it("clears pending orders", () => {
    const store = new InMemoryOrderStore();

    store.upsertPendingOrder({
      orderId: "order_1",
      buyerDisplayName: "first",
      status: "AWAITING_SHIPMENT",
      updatedAt: "2026-05-14T10:00:01.000Z"
    });

    expect(store.clearPendingOrders()).toBe(1);
    expect(store.getPendingOrders()).toEqual([]);
  });
});
