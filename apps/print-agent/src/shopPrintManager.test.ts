import { describe, expect, it, vi } from "vitest";
import { ShopPrintManager } from "./shopPrintManager.js";
import type { ShopProfile } from "./shopProfiles.js";
import type { ShopConnectionEvents } from "./shopConnection.js";
import type { ShopIdentity } from "./shopIdentity.js";

const profiles: ShopProfile[] = [
  {
    id: "otaku",
    name: "Otaku",
    serverUrl: "http://localhost:1",
    token: "secret-otaku",
    shopId: "shop-a",
    warehouseIds: ["a"]
  },
  {
    id: "crossing",
    name: "Crossing",
    serverUrl: "http://localhost:2",
    token: "secret-crossing",
    shopId: "shop-b",
    warehouseIds: ["b", "b2"]
  }
];
const job = (shopId: string, warehouseId: string, id = "same-order") => ({
  id,
  orderId: id,
  storeId: "primary",
  shopId,
  warehouseId,
  productName: "A Pack",
  skuName: "123",
  buyerNickname: "buyer_1",
  createdAt: new Date().toISOString()
});
function fixture(
  print = vi.fn().mockResolvedValue(undefined),
  verify: (profile: ShopProfile) => Promise<ShopIdentity> = async (profile) => ({
    shopId: profile.shopId,
    storeId: "primary",
    warehouseIds: profile.warehouseIds
  })
) {
  const connections: Array<{
    profile: ShopProfile;
    events: ShopConnectionEvents;
    close: ReturnType<typeof vi.fn>;
  }> = [];
  const manager = new ShopPrintManager(
    profiles,
    { profileId: "otaku", warehouseId: "a" },
    false,
    print,
    {
      verify,
      connect: (profile, events) => {
        const connection = { profile, events, close: vi.fn() };
        connections.push(connection);
        return connection;
      }
    }
  );
  manager.start();
  return { manager, connections, print };
}

describe("shop credential switching", () => {
  it("retries unavailable identity without losing buffered orders or printing before verification", async () => {
    vi.useFakeTimers();
    const verify = vi.fn()
      .mockRejectedValueOnce(new Error("No legacy history after restart"))
      .mockResolvedValue({ shopId: "shop-a", storeId: "primary", warehouseIds: ["a"] });
    const { manager, connections, print } = fixture(vi.fn().mockResolvedValue(undefined), verify);
    try {
      connections[0]!.events.connected();
      connections[0]!.events.job(job("shop-a", "a"));
      await vi.advanceTimersByTimeAsync(0);
      expect(manager.snapshot().connection).toBe("error");
      expect(print).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(5000);
      expect(manager.snapshot().connection).toBe("connected");
      expect(print).toHaveBeenCalledOnce();
      expect(connections).toHaveLength(1);
      await manager.stop();
      await vi.advanceTimersByTimeAsync(10000);
      expect(verify).toHaveBeenCalledTimes(2);
    } finally {
      await manager.stop();
      vi.useRealTimers();
    }
  });

  it("uses each shop's token and keeps identical order numbers/history isolated", async () => {
    const { manager, connections, print } = fixture();
    connections[0]!.events.connected();
    await vi.waitFor(() => expect(manager.snapshot().connection).toBe("connected"));
    connections[0]!.events.job(job("shop-a", "a"));
    await vi.waitFor(() => expect(manager.snapshot().history).toHaveLength(1));
    await manager.settings({ profileId: "crossing", warehouseId: "b" });
    expect(connections[0]!.close).toHaveBeenCalledOnce();
    expect(connections.map((connection) => connection.profile.token)).toEqual([
      "secret-otaku",
      "secret-crossing"
    ]);
    expect(manager.snapshot().history).toEqual([]);
    connections[1]!.events.connected();
    await vi.waitFor(() => expect(manager.snapshot().connection).toBe("connected"));
    connections[0]!.events.job(job("shop-a", "a", "stale-job"));
    connections[0]!.events.disconnected();
    expect(manager.snapshot().connection).toBe("connected");
    connections[1]!.events.job(job("shop-b", "b"));
    await vi.waitFor(() => expect(manager.snapshot().history).toHaveLength(1));
    expect(print).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(manager.snapshot())).not.toContain("secret-");
    await manager.settings({ profileId: "otaku", warehouseId: "a" });
    expect(manager.snapshot().history).toHaveLength(1);
    expect(manager.snapshot().lastPrintedByWarehouse.a?.pickCode).toBe("A 123");
    await manager.stop();
  });

  it("finishes the current label before opening another shop and holds the old queue", async () => {
    let finish!: () => void;
    const print = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        })
    );
    const { manager, connections } = fixture(print);
    connections[0]!.events.connected();
    await vi.waitFor(() => expect(manager.snapshot().connection).toBe("connected"));
    connections[0]!.events.job(job("shop-a", "a", "one"));
    connections[0]!.events.job(job("shop-a", "a", "two"));
    const switching = manager.settings({ profileId: "crossing", warehouseId: "b" });
    expect(manager.snapshot().switchingStore).toBe(true);
    expect(connections).toHaveLength(1);
    await expect(manager.settings({ warehouseId: "a" })).rejects.toThrow("busy");
    finish();
    await switching;
    expect(connections).toHaveLength(2);
    expect(print).toHaveBeenCalledTimes(1);
    await manager.settings({ profileId: "otaku", warehouseId: "a" });
    expect(manager.snapshot().queue).toHaveLength(1);
    expect(manager.snapshot().queue[0]?.orderId).toBe("two");
    await manager.stop();
  });

  it("rejects a warehouse from another shop before changing the connection", async () => {
    const { manager, connections } = fixture();
    await expect(manager.settings({ profileId: "otaku", warehouseId: "b" })).rejects.toThrow(
      "does not belong"
    );
    expect(connections).toHaveLength(1);
    expect(manager.snapshot().selectedProfileId).toBe("otaku");
    await manager.stop();
  });

  it("does not print until identity is verified and fails closed on mismatched job identity", async () => {
    let verify!: (identity: ShopIdentity) => void;
    const { manager, connections, print } = fixture(
      vi.fn().mockResolvedValue(undefined),
      () =>
        new Promise((resolve) => {
          verify = resolve;
        })
    );
    connections[0]!.events.connected();
    connections[0]!.events.job({ ...job("shop-a", "a"), storeId: "wrong-room" });
    expect(print).not.toHaveBeenCalled();
    verify({ shopId: "shop-a", storeId: "primary" });
    await vi.waitFor(() => expect(manager.snapshot().connection).toBe("error"));
    expect(print).not.toHaveBeenCalled();
    await manager.stop();
  });

  it("ignores a previous shop's late credential verification", async () => {
    let resolveOld!: (identity: ShopIdentity) => void;
    const { manager, connections, print } = fixture(
      vi.fn().mockResolvedValue(undefined),
      (profile) =>
        profile.id === "otaku"
          ? new Promise((resolve) => {
              resolveOld = resolve;
            })
          : Promise.resolve({ shopId: "shop-b" })
    );
    connections[0]!.events.connected();
    connections[0]!.events.job(job("shop-a", "a"));
    await manager.settings({ profileId: "crossing", warehouseId: "b" });
    connections[1]!.events.connected();
    await vi.waitFor(() => expect(manager.snapshot().connection).toBe("connected"));
    resolveOld({ shopId: "shop-a" });
    await Promise.resolve();
    expect(print).not.toHaveBeenCalled();
    expect(manager.snapshot().selectedProfileId).toBe("crossing");
    connections[1]!.events.job(job("shop-a", "b"));
    expect(manager.snapshot().connection).toBe("error");
    expect(print).not.toHaveBeenCalled();
    await manager.stop();
  });
});
