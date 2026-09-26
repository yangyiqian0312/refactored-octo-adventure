import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { createApp } from "./server.js";

describe("payment webhook integration", () => {
  it("retains unpaid orders without emitting a print job, removes them when paid, and deduplicates", async () => {
    const context = await createApp(loadConfig({ TIKTOK_WEBHOOK_VERIFY_BYPASS: "true" }));
    try {
      const send = (status: string, timestamp: number) =>
        context.app.inject({
          method: "POST",
          url: "/webhooks/tiktok",
          payload: {
            event_id: `test-${status}`,
            timestamp,
            data: { order_id: "test-order", order_status: status }
          }
        });
      expect((await send("UNPAID", 1720000000)).statusCode).toBe(200);
      await expect.poll(() => context.store.paymentHolds.list().length).toBe(1);
      expect(context.store.getRecentAlerts()).toEqual([]);
      expect(context.store.getPendingOrders()).toEqual([]);
      expect((await send("UNPAID", 1720000000)).json().duplicate).toBe(true);
      expect((await send("AWAITING_SHIPMENT", 1720000001)).statusCode).toBe(200);
      await expect.poll(() => context.store.paymentHolds.list().length).toBe(0);
      await expect.poll(() => context.store.getRecentAlerts().length).toBe(1);
    } finally {
      context.io.close();
      await context.app.close();
    }
  });
});
