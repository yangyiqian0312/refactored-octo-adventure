import { describe, expect, it } from "vitest";
import {
  formatBuyerId,
  formatPickCode,
  formatProductPaidAmount,
  formatShortOrderId,
  renderRolloLabelHtml,
  shortOrderId
} from "./label.js";

describe("renderRolloLabelHtml", () => {
  it("renders a 1.5x1 safe label", () => {
    const html = renderRolloLabelHtml({
      id: "print_1",
      storeId: "store2",
      shopId: "7495210574874380572",
      orderId: "577387538643456175",
      skuName: "487",
      productName: "A $1 START POKEMON/OP/TCG",
      buyerNickname: "buyer123",
      productPaidAmount: 30,
      productPaidCurrency: "USD",
      createdAt: new Date().toISOString()
    });

    expect(html).toContain("size: 1.5in 1in");
    expect(html).toContain("ORDER #56175");
    expect(html).not.toContain("EZ PEEL↗");
    expect(html).toContain("*This label peels off easily.");
    expect(html).not.toContain("*This label is easy peelable.");
    expect(html).not.toContain("577387538643456175");
    expect(html).not.toContain("A $1 START POKEMON/OP/TCG");
    expect(html).toContain("@buyer123");
    expect(html).toContain(">30</span>");
    expect(html).not.toContain("$30");
    expect(html).toContain("A 487");
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

  it("combines the leading title letter with the number", () => {
    expect(formatPickCode("A $1 START POKEMON", "487")).toBe("A 487");
    expect(formatPickCode("C $1 START ONE PIECE", "#912")).toBe("C 912");
  });

  it("falls back to the number when the title has no leading code", () => {
    expect(formatPickCode("Pokemon Booster Pack", "487")).toBe("487");
  });

  it("formats the product-only paid amount compactly", () => {
    expect(formatProductPaidAmount(30, "USD")).toBe("30");
    expect(formatProductPaidAmount(30.5, "USD")).toBe("30.5");
    expect(formatProductPaidAmount(5000, "IDR")).toBe("5000 IDR");
  });

});
