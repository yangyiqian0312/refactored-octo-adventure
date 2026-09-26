import { readFile, writeFile, rename } from "node:fs/promises";
import { printSelectionSchema } from "@live-alerts/shared";
import type { ShopProfile } from "./shopProfiles.js";

type Selection = { profileId: string; warehouseId: string };

export async function loadShopSelection(
  filePath: string,
  profiles: ShopProfile[],
  env: NodeJS.ProcessEnv,
  warehouseArgument?: string
): Promise<Selection> {
  if (!warehouseArgument) {
    try {
      const selection = printSelectionSchema.parse(JSON.parse(await readFile(filePath, "utf8")));
      if (
        profiles.some(
          (profile) =>
            profile.id === selection.profileId &&
            profile.warehouseIds.includes(selection.warehouseId)
        )
      )
        return selection;
      throw new Error("Saved shop is no longer configured");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new Error(
          "Saved print selection is invalid; repair or remove print-selection.json before starting."
        );
      }
    }
  }
  const warehouseId = warehouseArgument || env.PRINT_AGENT_WAREHOUSE_ID;
  const explicitMatches = warehouseArgument
    ? profiles.filter((candidate) => candidate.warehouseIds.includes(warehouseArgument))
    : [];
  if (warehouseArgument && explicitMatches.length !== 1)
    throw new Error("Explicit warehouse must belong to exactly one configured shop");
  const profile = warehouseArgument
    ? explicitMatches[0]
    : env.PRINT_AGENT_PROFILE_ID
      ? profiles.find((candidate) => candidate.id === env.PRINT_AGENT_PROFILE_ID)
      : (profiles.find(
          (candidate) => warehouseId && candidate.warehouseIds.includes(warehouseId)
        ) ?? profiles[0]);
  if (!profile || (warehouseId && !profile.warehouseIds.includes(warehouseId)))
    throw new Error("Initial print store and warehouse do not match");
  return { profileId: profile.id, warehouseId: warehouseId || profile.warehouseIds[0]! };
}

export async function saveShopSelection(filePath: string, selection: Selection): Promise<void> {
  const value = printSelectionSchema.parse(selection);
  await writeFile(`${filePath}.tmp`, JSON.stringify(value), "utf8");
  await rename(`${filePath}.tmp`, filePath);
}
