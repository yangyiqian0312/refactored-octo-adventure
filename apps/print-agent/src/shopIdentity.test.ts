import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyShopIdentity, WaitingForShopEvidence } from "./shopIdentity.js";
import { loadShopProfiles } from "./shopProfiles.js";

const profile = {
  id: "otaku",
  name: "Otaku",
  serverUrl: "https://example.test",
  token: "private-token",
  shopId: "shop-a",
  warehouseIds: ["warehouse-a"]
};
afterEach(() => vi.unstubAllGlobals());
describe("store identity", () => {
  it("waits for evidence on an empty legacy history and accepts only a matching socket job", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("print-identity")
      ? new Response("", { status: 404 })
      : Response.json({ ok: true, webhooks: [] })));
    const evidence = {
      id: "job", orderId: "order", storeId: "store2", shopId: "shop-a",
      warehouseId: "warehouse-a", productName: "A", skuName: "123",
      buyerNickname: "buyer", createdAt: new Date().toISOString()
    };
    await expect(verifyShopIdentity(profile)).rejects.toBeInstanceOf(WaitingForShopEvidence);
    await expect(verifyShopIdentity(profile, evidence)).resolves.toEqual({shopId: "shop-a", storeId: "store2"});
    await expect(verifyShopIdentity(profile, {...evidence, shopId: "shop-b"})).rejects.toThrow("mismatch");
    await expect(verifyShopIdentity(profile, {...evidence, warehouseId: "other"})).rejects.toThrow("mismatch");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", {status: 401})));
    await expect(verifyShopIdentity(profile, evidence)).rejects.toThrow("authentication");
  });
  it("authenticates with the selected token and validates authoritative identity", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        Response.json({
          ok: true,
          shopId: "shop-a",
          storeId: "store2",
          warehouses: [{ id: "warehouse-a", name: "A" }]
        })
      );
    vi.stubGlobal("fetch", fetch);
    expect(await verifyShopIdentity(profile)).toEqual({
      shopId: "shop-a",
      storeId: "store2",
      warehouseIds: ["warehouse-a"]
    });
    expect(fetch.mock.calls[0]?.[1].headers.authorization).toBe("Bearer private-token");
  });
  it("rejects wrong-shop credentials and never falls back after authentication failure", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("", { status: 401 }));
    vi.stubGlobal("fetch", fetch);
    await expect(verifyShopIdentity(profile)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("requires matching observed shop IDs for legacy servers", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response("", { status: 404 }))
      .mockResolvedValueOnce(Response.json({ ok: true, webhooks: [{ shopId: "shop-b" }] }));
    vi.stubGlobal("fetch", fetch);
    await expect(verifyShopIdentity(profile)).rejects.toThrow("mismatch");
  });
  it("does not reuse the legacy agent token as a credential for two shops", () => {
    expect(() =>
      loadShopProfiles({ PRINT_AGENT_TOKEN: "one-token", PRINT_AGENT_WAREHOUSE_ID: "a" })
    ).toThrow();
    const profiles = loadShopProfiles({
      TIKTOK_STORE2_OVERLAY_TOKEN: "a-token",
      TIKTOK_STORE2_SHOP_ID: "a",
      TIKTOK_STORE3_OVERLAY_TOKEN: "b-token",
      TIKTOK_STORE3_SHOP_ID: "b"
    });
    expect(profiles.map((entry) => entry.token)).toEqual(["a-token", "b-token"]);
    expect(profiles.map((entry) => entry.shopId)).toEqual(["a", "b"]);
  });
});
