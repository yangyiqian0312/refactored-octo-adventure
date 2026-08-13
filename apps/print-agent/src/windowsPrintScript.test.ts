import { describe, expect, it } from "vitest";
import { renderWindowsPrintScript } from "./windowsPrintScript.js";

describe("renderWindowsPrintScript", () => {
  it("uses the production 1.5x1 pick label layout", () => {
    const script = renderWindowsPrintScript();
    expect(script).toContain("PaperSize('1.5x1', 100, 150)");
    expect(script).toContain("$pickFont");
    expect(script).toContain("$job.buyerName");
    expect(script).toContain("*This label peels off easily.");
    expect(script).toContain("RectangleF(92, 5, 40, 12)");
    expect(script).toContain("[Console]::In.ReadLine()");
    expect(script).toContain("ConvertFrom-Json");
    expect(script).toContain("ConvertTo-Json -Compress");
    expect(script).toContain("$graphics.MeasureString($job.pickCode, $pickFont)");
    expect(script).toContain("DrawString('(fixed)', $fixedPickFont");
    expect(script).toContain("PointF($fixedX, 52)");
    expect(script).toContain("$job.late");
    expect(script).not.toContain("LATE - CHECK");
    expect(script).not.toContain("('BUYER ' +");
  });
});
