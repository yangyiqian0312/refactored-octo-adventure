import type { LabelPrintRule } from "./config.js";

export function findMatchingLabelPrintRule(
  rules: LabelPrintRule[],
  shopId: string | undefined,
  warehouseId: string | undefined
): LabelPrintRule | undefined {
  if (!shopId) {
    return undefined;
  }

  if (warehouseId) {
    const exactRule = rules.find(
      (rule) => rule.shopId === shopId && rule.warehouseId === warehouseId
    );
    if (exactRule) {
      return exactRule;
    }
  }

  const rulesForShop = rules.filter((rule) => rule.shopId === shopId);
  const warehouseIds = new Set(rulesForShop.map((rule) => rule.warehouseId));
  return warehouseIds.size === 1 ? rulesForShop[0] : undefined;
}
