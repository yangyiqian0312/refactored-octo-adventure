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

  it("uses the only configured warehouse when TikTok omits warehouse id", () => {
    expect(findMatchingLabelPrintRule(rules, "shop-a", undefined)).toEqual(rules[0]);
  });

  it("treats duplicate rules for the same warehouse as one configured warehouse", () => {
    const duplicateRules = [rules[0], { ...rules[0] }];
    expect(findMatchingLabelPrintRule(duplicateRules, "shop-a", undefined)).toEqual(rules[0]);
  });

  it("fails closed when an omitted warehouse is ambiguous", () => {
    expect(findMatchingLabelPrintRule(rules, "shop-b", undefined)).toBeUndefined();
  });

  it("uses the only configured warehouse when TikTok returns a different internal id", () => {
    expect(findMatchingLabelPrintRule(rules, "shop-a", "warehouse-other")).toEqual(rules[0]);
  });

  it("fails closed on a different warehouse when the shop has multiple warehouses", () => {
    expect(findMatchingLabelPrintRule(rules, "shop-b", "warehouse-other")).toBeUndefined();
  });
});
