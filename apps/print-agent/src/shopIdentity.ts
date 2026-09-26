import type { ShopProfile } from "./shopProfiles.js";
import { printIdentitySchema, legacyPrintIdentitySchema, type LabelPrintJob } from "@live-alerts/shared";

export type ShopIdentity = { shopId: string; storeId?: string; warehouseIds?: string[] };

export class WaitingForShopEvidence extends Error {}

// Evidence must come from this profile's authenticated socket, never a local demo.
export async function verifyShopIdentity(profile: ShopProfile, evidence?: LabelPrintJob): Promise<ShopIdentity> {
  const options = () => ({
    headers: { authorization: `Bearer ${profile.token}` },
    signal: AbortSignal.timeout(10000),
    redirect: "error" as const
  });
  const response = await fetch(`${profile.serverUrl}/api/print-identity`, options());
  if (response.ok) {
    const body = printIdentitySchema.parse(await response.json());
    if (body.shopId !== profile.shopId) throw new Error("Shop identity mismatch");
    const warehouseIds = body.warehouses.map((warehouse) => warehouse.id);
    return { shopId: profile.shopId, storeId: body.storeId, warehouseIds };
  }
  if (response.status !== 404) throw new Error("Shop authentication failed");
  // Read-only compatibility for older deployments. Require actual shop IDs in
  // this token's authorized webhook history; an empty history is not proof.
  // Every incoming print job is independently checked against the expected shop.
  const legacy = await fetch(`${profile.serverUrl}/api/recent-webhooks`, options());
  if (!legacy.ok) throw new Error("Shop authentication failed");
  const body = legacyPrintIdentitySchema.parse(await legacy.json());
  const shopIds = body.webhooks.flatMap((event) => (event.shopId ? [event.shopId] : []));
  if (shopIds.some((id) => id !== profile.shopId))
    throw new Error("Shop identity mismatch");
  if (!shopIds.length) {
    if (!evidence) throw new WaitingForShopEvidence("Waiting for authenticated shop order");
    if (evidence.shopId !== profile.shopId || !profile.warehouseIds.includes(evidence.warehouseId))
      throw new Error("Shop identity mismatch");
    return { shopId: profile.shopId, storeId: evidence.storeId };
  }
  return { shopId: profile.shopId };
}
