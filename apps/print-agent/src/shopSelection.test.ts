import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { loadShopSelection, saveShopSelection } from "./shopSelection.js";

describe("remember selected shop", () => {
  it("restores a switched shop over old environment defaults without saving credentials", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "print-selection-test-"));
    if (
      path.dirname(path.resolve(directory)) !== path.resolve(tmpdir()) ||
      !path.basename(directory).startsWith("print-selection-test-")
    )
      throw new Error("Unexpected test directory");
    const filename = path.join(directory, "selection.json");
    const profiles = [
      {
        id: "a",
        name: "A",
        serverUrl: "http://localhost",
        token: "secret-a",
        shopId: "shop-a",
        warehouseIds: ["a1"]
      },
      {
        id: "b",
        name: "B",
        serverUrl: "http://localhost",
        token: "secret-b",
        shopId: "shop-b",
        warehouseIds: ["b1"]
      }
    ];
    try {
      await saveShopSelection(filename, { profileId: "a", warehouseId: "a1" });
      await saveShopSelection(filename, { profileId: "b", warehouseId: "b1" });
      expect(
        await loadShopSelection(filename, profiles, { PRINT_AGENT_WAREHOUSE_ID: "a1" })
      ).toEqual({ profileId: "b", warehouseId: "b1" });
      expect(await readFile(filename, "utf8")).not.toContain("secret");
      await expect(loadShopSelection(filename, profiles.slice(0, 1), {})).rejects.toThrow(
        "invalid"
      );
      expect(
        await loadShopSelection(filename, profiles, { PRINT_AGENT_PROFILE_ID: "b" }, "a1")
      ).toEqual({
        profileId: "a",
        warehouseId: "a1"
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
