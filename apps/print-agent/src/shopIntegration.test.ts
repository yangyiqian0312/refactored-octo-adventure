import { describe, expect, it, vi } from "vitest";
import { createApp } from "../../server/src/server.js";
import { loadConfig } from "../../server/src/config.js";
import { ShopPrintManager } from "./shopPrintManager.js";
import { io as connectSocket } from "socket.io-client";

describe("two-shop socket integration", () => {
  it("switches authentication rooms and only prints the selected shop's orders", async () => {
    const { app, io } = await createApp(
      loadConfig({
        OVERLAY_ALLOWED_TOKEN: "primary-test",
        TIKTOK_STORE2_OVERLAY_TOKEN: "token-a",
        TIKTOK_STORE2_SHOP_ID: "shop-a",
        TIKTOK_STORE3_OVERLAY_TOKEN: "token-b",
        TIKTOK_STORE3_SHOP_ID: "shop-b",
        LABEL_PRINT_SHOP_ID: "shop-b",
        LABEL_PRINT_WAREHOUSE_ID: "b",
        LABEL_PRINT_SHOP_ID_2: "shop-a",
        LABEL_PRINT_WAREHOUSE_ID_2: "a",
        LABEL_PRINT_SHOP_ID_3: "shop-b",
        LABEL_PRINT_WAREHOUSE_ID_3: "b2"
      })
    );
    const serverUrl = await app.listen({ port: 0, host: "127.0.0.1" });
    const print = vi.fn().mockResolvedValue(undefined);
    const profiles = [
      { id: "a", name: "A", token: "token-a", shopId: "shop-a", warehouseIds: ["a"], serverUrl },
      {
        id: "b",
        name: "B",
        token: "token-b",
        shopId: "shop-b",
        warehouseIds: ["b", "b2"],
        serverUrl
      }
    ];
    const manager = new ShopPrintManager(
      profiles,
      { profileId: "a", warehouseId: "a" },
      false,
      print
    );
    try {
      manager.start();
      await vi.waitFor(() => expect(manager.snapshot().connection).toBe("connected"));
      const send = async (token: string, warehouseId: string, orderId: string) =>
        app.inject({
          method: "POST",
          url: "/api/test-order",
          headers: { authorization: `Bearer ${token}` },
          payload: {
            orderId,
            warehouseId,
            skuName: "123",
            productTitle: "A Pack",
            buyerNickname: "buyer",
            quantity: 1
          }
        });
      await send("token-a", "a", "order-1");
      await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(1));
      expect(print.mock.calls[0]?.[0].shopId).toBe("shop-a");
      await manager.settings({ profileId: "b", warehouseId: "b" });
      await vi.waitFor(() => expect(manager.snapshot().connection).toBe("connected"));
      expect(manager.snapshot().history).toHaveLength(0);
      await send("token-a", "a", "inactive-order");
      await send("token-b", "b", "order-1");
      await vi.waitFor(() => expect(print).toHaveBeenCalledTimes(2));
      expect(print.mock.calls[1]?.[0].shopId).toBe("shop-b");
      expect(manager.snapshot().history).toHaveLength(1);
      expect(JSON.stringify(manager.snapshot())).not.toContain("token-");
      expect((await app.inject({ method: "GET", url: "/api/print-identity" })).statusCode).toBe(
        401
      );
      const identity = (
        await app.inject({
          method: "GET",
          url: "/api/print-identity",
          headers: { authorization: "Bearer token-a" }
        })
      ).json();
      expect(identity.shopId).toBe("shop-a");
      expect(identity.warehouses.map((warehouse: { id: string }) => warehouse.id)).toEqual(["a"]);
      const wrongShop = connectSocket(serverUrl, {
        auth: { token: "token-a", shopId: "shop-b" },
        autoConnect: false,
        reconnection: false
      });
      try {
        const rejection = new Promise<string>((resolve) =>
          wrongShop.once("connect_error", (error) => resolve(error.message))
        );
        wrongShop.connect();
        expect(await rejection).toBe("shop identity mismatch");
      } finally {
        wrongShop.disconnect();
      }
    } finally {
      await manager.stop();
      io.close();
      await app.close();
    }
  });
});
