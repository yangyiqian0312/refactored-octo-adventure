import { describe, expect, it } from "vitest";
import { loadConfig } from "../../server/src/config.js";
import { loadShopProfiles } from "./shopProfiles.js";

describe("Otaku warehouse configuration", () => {
  it("uses the confirmed order warehouse on both server and agent without Crossing credentials", () => {
    const profiles = loadShopProfiles({
      TIKTOK_STORE2_OVERLAY_TOKEN: "otaku-test-token",
      TIKTOK_STORE2_SHOP_ID: "7495169240868424019",
      TIKTOK_STORE3_OVERLAY_TOKEN: "crossing-test-token",
      TIKTOK_STORE3_SHOP_ID: "7495210574874380572"
    });
    const otaku = profiles.find((profile) => profile.id === "otaku")!;
    expect(otaku.token).toBe("otaku-test-token");
    expect(otaku.warehouseIds).toEqual(["7499833317727225642"]);
    expect(loadConfig({}).labelPrintRules).toContainEqual({
      shopId: otaku.shopId, warehouseId: otaku.warehouseIds[0]
    });
    expect(profiles.find((profile) => profile.id === "crossing")?.warehouseIds)
      .not.toContain(otaku.warehouseIds[0]);
  });
});
