import { describe, expect, it } from "vitest";
import { renderRolloLabelHtml, shortOrderId } from "./label.js";

describe("renderRolloLabelHtml", () => {
  it("renders a 2x1 safe label", () => {
    const html = renderRolloLabelHtml({
      id: "print_1",
      storeId: "store2",
      shopId: "7495210574874380572",
      orderId: "577387538643456175",
      buyerDisplayName: "buyer<id>",
      createdAt: new Date().toISOString()
    });

    expect(html).toContain("size: 2in 1in");
    expect(html).toContain("buyer&lt;id&gt;");
    expect(html).toContain("577387538643456175");
  });
});

describe("shortOrderId", () => {
  it("keeps the last 8 characters for filenames", () => {
    expect(shortOrderId("577387538643456175")).toBe("43456175");
  });
});
