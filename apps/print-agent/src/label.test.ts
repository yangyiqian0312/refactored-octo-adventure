import { describe, expect, it } from "vitest";
import { formatBuyerId, formatShortOrderId, renderRolloLabelHtml, shortOrderId } from "./label.js";

describe("renderRolloLabelHtml", () => {
  it("renders a 2x1 safe label", () => {
    const html = renderRolloLabelHtml({
      id: "print_1",
      storeId: "store2",
      shopId: "7495210574874380572",
      orderId: "577387538643456175",
      skuName: "ME03 Perfect Order",
      productName: "Pokemon Booster Pack",
      buyerNickname: "buyer123",
      createdAt: new Date().toISOString()
    });

    expect(html).toContain("size: 2in 1in");
    expect(html).toContain("577387538643456175");
    expect(html).toContain("Pokemon Booster Pack");
    expect(html).toContain("BUYER buyer123");
    expect(html).toContain("#ME03 Perfect Order");
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
