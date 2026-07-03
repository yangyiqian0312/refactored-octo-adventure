import { describe, expect, it } from "vitest";
import { formatBuyerId, formatShortOrderId, renderRolloLabelHtml, shortOrderId } from "./label.js";

describe("renderRolloLabelHtml", () => {
  it("renders a 2x1 safe label", () => {
    const html = renderRolloLabelHtml({
      id: "print_1",
      storeId: "store2",
      shopId: "7495210574874380572",
      orderId: "577387538643456175",
      skuId: "2729382476852921560",
      productName: "Pokemon Booster Pack",
      userId: "7021436810468230477",
      createdAt: new Date().toISOString()
    });

    expect(html).toContain("size: 2in 1in");
    expect(html).toContain("SKU 2729382476852921560");
    expect(html).toContain("Pokemon Booster Pack");
    expect(html).toContain("USER 7021436810468230477");
    expect(html).toContain("#56175");
  });
});

describe("shortOrderId", () => {
  it("keeps the last 8 characters for filenames", () => {
    expect(shortOrderId("577387538643456175")).toBe("56175");
  });
});

describe("label display formatting", () => {
  it("formats buyer and order fields", () => {
    expect(formatBuyerId("buyer123")).toBe("@buyer123");
    expect(formatBuyerId("@buyer123")).toBe("@buyer123");
    expect(formatShortOrderId("577387538643456175")).toBe("#56175");
  });
});
