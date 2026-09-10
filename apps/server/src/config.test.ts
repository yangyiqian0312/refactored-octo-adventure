import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("label print configuration", () => {
  it("includes the configured third warehouse by default", () => {
    const config = loadConfig({});

    expect(config.labelPrintRules).toContainEqual({
      shopId: "7495210574874380572",
      warehouseId: "7499485115637696302"
    });
  });
});
