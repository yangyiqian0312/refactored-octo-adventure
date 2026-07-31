import { describe, expect, it } from "vitest";
import { renderWindowsPrintScript } from "./windowsPrintScript.js";

describe("renderWindowsPrintScript", () => {
  it("uses the production 1.5x1 pick label layout", () => {
    const script = renderWindowsPrintScript();
    expect(script).toContain("PaperSize('1.5x1', 100, 150)");
    expect(script).toContain("$pickFont");
    expect(script).toContain("$buyerName");
    expect(script).toContain("*This label peels off easily.");
    expect(script).toContain("RectangleF(92, 5, 40, 12)");
    expect(script).not.toContain("('BUYER ' +");
  });
});
