import { describe, expect, it } from "vitest";
import type { OrderAlert } from "@live-alerts/shared";
import { enqueueAlert, popNextAlert } from "./alertQueue.js";

const baseAlert: OrderAlert = {
  id: "evt_1",
  source: "test",
  buyerDisplayName: "m***23",
  productTitle: "Pokemon Booster Pack",
  quantity: 3,
  createdAt: new Date().toISOString(),
  tier: "large"
};

describe("alert queue", () => {
  it("queues alerts in order", () => {
    const second = { ...baseAlert, id: "evt_2" };
    const queue = enqueueAlert(enqueueAlert([], baseAlert), second);

    expect(queue.map((alert) => alert.id)).toEqual(["evt_1", "evt_2"]);
  });

  it("does not enqueue duplicate ids", () => {
    const queue = enqueueAlert(enqueueAlert([], baseAlert), baseAlert);

    expect(queue).toHaveLength(1);
  });

  it("pops one alert at a time", () => {
    const second = { ...baseAlert, id: "evt_2" };
    const next = popNextAlert([baseAlert, second]);

    expect(next.current?.id).toBe("evt_1");
    expect(next.remaining.map((alert) => alert.id)).toEqual(["evt_2"]);
  });
});
