import { describe, expect, it } from "vitest";
import { findMatchingLabelPrintRule } from "./labelPrintRules.js";

const rules = [
  { shopId: "shop-a", warehouseId: "warehouse-a" },
  { shopId: "shop-b", warehouseId: "warehouse-b1" },
  { shopId: "shop-b", warehouseId: "warehouse-b2" }
];

describe("findMatchingLabelPrintRule", () => {
  it("matches an exact shop and warehouse pair", () => {
    expect(findMatchingLabelPrintRule(rules, "shop-b", "warehouse-b2")).toEqual(rules[2]);
  });

  it("fails closed when TikTok omits warehouse id", () => {
    expect(findMatchingLabelPrintRule(rules, "shop-b", undefined)).toBeUndefined();
  });

  it("fails closed when TikTok returns a different warehouse id", () => {
    expect(findMatchingLabelPrintRule(rules, "shop-a", "warehouse-other")).toBeUndefined();
  });
});
