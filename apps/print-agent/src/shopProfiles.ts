export type ShopProfile = {
  id: string;
  name: string;
  serverUrl: string;
  token: string;
  shopId: string;
  warehouseIds: string[];
};

export function loadShopProfiles(env: NodeJS.ProcessEnv): ShopProfile[] {
  const serverUrl =
    env.PRINT_AGENT_SERVER_URL ?? "https://tiktok-shop-live-alert-server.onrender.com";
  const profiles: ShopProfile[] = [];
  const add = (
    id: string,
    name: string,
    prefix: string,
    token: string | undefined,
    shopId: string | undefined,
    warehouseIds: string[]
  ) => {
    if (!token || !shopId || !warehouseIds.length) return;
    const url = env[`${prefix}_SERVER_URL`] || serverUrl;
    const parsed = new URL(url);
    if (!["https:", "http:"].includes(parsed.protocol) || parsed.username || parsed.password)
      throw new Error("Invalid print server URL");
    profiles.push({
      id,
      name,
      serverUrl: url.replace(/\/$/, ""),
      token,
      shopId,
      warehouseIds: [...new Set(warehouseIds)]
    });
  };
  const warehouses = (value: string | undefined, fallback: string[]) =>
    value === undefined
      ? fallback
      : value
          .split(",")
          .map((id) => id.trim())
          .filter(Boolean);
  add(
    "otaku",
    "Otaku Card Haven",
    "PRINT_AGENT_OTAKU",
    env.PRINT_AGENT_OTAKU_TOKEN || env.TIKTOK_STORE2_OVERLAY_TOKEN,
    env.PRINT_AGENT_OTAKU_SHOP_ID || env.TIKTOK_STORE2_SHOP_ID,
    warehouses(env.PRINT_AGENT_OTAKU_WAREHOUSE_IDS, [
      env.LABEL_PRINT_WAREHOUSE_ID_2 || "7499833317727225642"
    ])
  );
  add(
    "crossing",
    "Crossing TCG",
    "PRINT_AGENT_CROSSING",
    env.PRINT_AGENT_CROSSING_TOKEN || env.TIKTOK_STORE3_OVERLAY_TOKEN,
    env.PRINT_AGENT_CROSSING_SHOP_ID || env.TIKTOK_STORE3_SHOP_ID,
    warehouses(env.PRINT_AGENT_CROSSING_WAREHOUSE_IDS, [
      env.LABEL_PRINT_WAREHOUSE_ID || "7581531451641317175",
      env.LABEL_PRINT_WAREHOUSE_ID_3 || "7499485115637696302"
    ])
  );
  // Legacy single-shop installations require an explicit shop identity. Never
  // infer a token's owner from the selected warehouse or reuse it for two shops.
  if (!profiles.length)
    add(
      "configured",
      "Configured shop",
      "PRINT_AGENT",
      env.PRINT_AGENT_TOKEN || env.OVERLAY_ALLOWED_TOKEN,
      env.PRINT_AGENT_SHOP_ID || env.TIKTOK_SHOP_ID,
      warehouses(
        env.PRINT_AGENT_WAREHOUSE_IDS,
        env.PRINT_AGENT_WAREHOUSE_ID ? [env.PRINT_AGENT_WAREHOUSE_ID] : []
      )
    );
  if (!profiles.length)
    throw new Error("Configure each print shop's token, shop ID and warehouses before starting.");
  return profiles;
}
