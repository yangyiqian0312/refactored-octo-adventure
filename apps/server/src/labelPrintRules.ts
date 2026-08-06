import type { LabelPrintRule } from "./config.js";

export function findMatchingLabelPrintRule(
  rules: LabelPrintRule[],
  shopId: string | undefined,
  warehouseId: string | undefined
): LabelPrintRule | undefined {
  if (!shopId || !warehouseId) {
    return undefined;
  }

  return rules.find(
    (rule) => rule.shopId === shopId && rule.warehouseId === warehouseId
  );
}
