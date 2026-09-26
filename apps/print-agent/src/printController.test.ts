import { describe, expect, it, vi } from "vitest";
import type { LabelPrintJob } from "@live-alerts/shared";
import { PrintController } from "./printController.js";

const job = (id: string, warehouseId = "a"): LabelPrintJob => ({
  id,
  orderId: `order-${id}`,
  warehouseId,
  storeId: "shop",
  shopId: "shop",
  buyerNickname: "private buyer",
  productName: "A Pack",
  skuName: id,
  createdAt: new Date().toISOString()
});
const context = {
  warehouses: [
    { id: "a", name: "A" },
    { id: "b", name: "B" }
  ],
  paymentHolds: []
};

describe("PrintController", () => {
  it("updates the same failed payment row to Fixed only after its recovered print succeeds", async () => {
    let finish!: () => void;
    const print = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const controller = new PrintController(false, "a", print);
    const hold = {
      orderId: "order-123",
      warehouseId: "a",
      buyerDisplayName: "collector_7",
      productTitle: "A Pack",
      skuName: "123",
      status: "unpaid" as const,
      rawStatus: "UNPAID",
      updatedAt: new Date().toISOString()
    };
    controller.paymentHolds([hold]);
    const original = controller.snapshot().history[0]!;
    expect(original).toMatchObject({
      pickCode: "A 123",
      buyerDisplayName: "@collector_7",
      status: "failed"
    });
    controller.paymentHolds([]);
    expect(controller.snapshot().history[0]?.status).toBe("failed");
    controller.receive({ ...job("123"), buyerNickname: "collector_7" });
    expect(print).toHaveBeenCalledWith(expect.objectContaining({ orderId: "order-123" }), true);
    expect(controller.snapshot().history[0]?.status).toBe("failed");
    finish();
    await vi.waitFor(() => expect(controller.snapshot().history[0]?.status).toBe("fixed"));
    expect(controller.snapshot().history).toHaveLength(1);
    expect(controller.snapshot().history[0]?.id).toBe(original.id);
    controller.paymentHolds([hold]);
    expect(controller.snapshot().paymentHolds).toEqual([]);
    expect(controller.snapshot().history[0]?.status).toBe("fixed");
  });

  it("keeps last successful number after a failure and identifies late fixes", async () => {
    const print = vi
      .fn()
      .mockResolvedValueOnce({ fixed: true })
      .mockRejectedValueOnce(new Error("offline"));
    const controller = new PrintController(false, "a", print);
    controller.receive(job("123"));
    await vi.waitFor(() => expect(controller.snapshot().latest?.status).toBe("fixed"));
    controller.receive(job("124"));
    await vi.waitFor(() => expect(controller.snapshot().paused).toBe(true));
    expect(controller.snapshot().latest?.pickCode).toBe("A 123");
    expect(controller.snapshot().lastPrintedByWarehouse.a?.pickCode).toBe("A 123");
    expect(controller.snapshot().history[0]?.status).toBe("failed");
  });

  it("does not merge different full order ids with the same number or order suffix", async () => {
    const controller = new PrintController(false, "a", async () => undefined);
    controller.paymentHolds([
      {
        orderId: "first-12345",
        warehouseId: "a",
        buyerDisplayName: "Someone",
        skuName: "123",
        status: "payment_failed",
        rawStatus: "PAYMENT_FAILED",
        updatedAt: new Date().toISOString()
      }
    ]);
    controller.receive({ ...job("123"), orderId: "second-12345" });
    await vi.waitFor(() => expect(controller.snapshot().history).toHaveLength(2));
    expect(controller.snapshot().history.map((row) => row.status)).toEqual(["submitted", "failed"]);
  });
  it("finishes the active label before switching, retaining other warehouse jobs", async () => {
    const finish: Array<() => void> = [];
    const print = vi.fn(() => new Promise<void>((resolve) => finish.push(resolve)));
    const controller = new PrintController(false, "a", print);
    controller.context(context);
    controller.receive(job("1"));
    controller.receive(job("2"));
    controller.receive(job("3", "b"));
    expect(controller.snapshot().current?.pickCode).toBe("A 1");
    controller.settings({ warehouseId: "b" });
    expect(print).toHaveBeenCalledTimes(1);
    finish.shift()!();
    await vi.waitFor(() => expect(controller.snapshot().current?.pickCode).toBe("A 3"));
    expect(controller.snapshot().queue.map((row) => row.pickCode)).toEqual(["A 2"]);
    finish.shift()!();
    await vi.waitFor(() => expect(controller.snapshot().current).toBeNull());
    controller.settings({ warehouseId: "a" });
    expect(print).toHaveBeenCalledTimes(3);
    finish.shift()!();
  });

  it("pauses on uncertain print outcome without automatically retrying or overlapping", async () => {
    const print = vi.fn().mockRejectedValue(new Error("contains private details"));
    const controller = new PrintController(false, "a", print);
    controller.receive(job("1"));
    controller.receive(job("2"));
    await vi.waitFor(() => expect(controller.snapshot().paused).toBe(true));
    expect(print).toHaveBeenCalledTimes(1);
    expect(controller.snapshot().history[0]?.status).toBe("failed");
    expect(JSON.stringify(controller.snapshot())).not.toContain("private");
    expect(controller.snapshot().queue).toHaveLength(1);
  });

  it("requires warehouse selection, deduplicates per shop/order, and marks dry-run as preview", async () => {
    const print = vi.fn().mockResolvedValue(undefined);
    const controller = new PrintController(true, "", print);
    controller.context(context);
    controller.receive(job("1"));
    controller.receive({ ...job("1"), id: "different-event" });
    expect(print).not.toHaveBeenCalled();
    expect(controller.snapshot().queue).toHaveLength(1);
    expect(() => controller.settings({ warehouseId: "invalid" })).toThrow();
    controller.settings({ warehouseId: "a", paused: true });
    expect(print).not.toHaveBeenCalled();
    controller.settings({ paused: false });
    await vi.waitFor(() => expect(controller.snapshot().latest?.status).toBe("preview"));
    expect(print).toHaveBeenCalledTimes(1);
  });
});
