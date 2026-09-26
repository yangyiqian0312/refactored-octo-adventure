import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";
import { findMatchingLabelPrintRule } from "./labelPrintRules.js";

describe("Otaku print rule configuration", () => {
  it("matches the actual Otaku shop and keeps Crossing isolated", () => {
    const { labelPrintRules } = loadConfig({});
    expect(findMatchingLabelPrintRule(labelPrintRules, "7495169240868424019", "7499833317727225642")).toBeDefined();
    expect(findMatchingLabelPrintRule(labelPrintRules, "7495169240868424019", "7263214411597498155")).toBeUndefined();
    expect(findMatchingLabelPrintRule(labelPrintRules, "7495210574874380572", "7499833317727225642")).toBeUndefined();
    expect(findMatchingLabelPrintRule(labelPrintRules, "7495180900215261343", "7499833317727225642")).toBeUndefined();
  });

  it("uses the configured store identity when there is no explicit print override", () => {
    const { labelPrintRules } = loadConfig({ TIKTOK_STORE2_SHOP_ID: "configured-shop" });
    expect(labelPrintRules[1]?.shopId).toBe("configured-shop");
  });

  it("preserves explicit shop and warehouse overrides", () => {
    const { labelPrintRules } = loadConfig({
      TIKTOK_STORE2_SHOP_ID: "configured-shop",
      LABEL_PRINT_SHOP_ID_2: "explicit-shop",
      LABEL_PRINT_WAREHOUSE_ID_2: "explicit-warehouse"
    });
    expect(labelPrintRules[1]).toEqual({ shopId: "explicit-shop", warehouseId: "explicit-warehouse" });
  });
});
