import "dotenv/config";

export type AppConfig = {
  port: number;
  overlayAllowedToken: string;
  stores: TikTokStoreConfig[];
  tiktokApiBaseUrl: string;
  tiktokAuthBaseUrl: string;
  tiktokApiVersion: string;
  tiktokAppKey: string | undefined;
  tiktokAppSecret: string | undefined;
  tiktokShopId: string | undefined;
  tiktokShopCipher: string | undefined;
  tiktokAccessToken: string | undefined;
  tiktokRefreshToken: string | undefined;
  tiktokWebhookSecret: string | undefined;
  tiktokWebhookVerifyBypass: boolean;
  labelPrintRules: LabelPrintRule[];
  hasTikTokCredentials: boolean;
};

export type LabelPrintRule = {
  shopId: string;
  warehouseId: string;
};

export type TikTokStoreConfig = {
  id: string;
  overlayToken: string;
  tiktokShopId: string | undefined;
  tiktokShopCipher: string | undefined;
  tiktokAccessToken: string | undefined;
  tiktokRefreshToken: string | undefined;
  hasTikTokCredentials: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const primaryStore = buildStoreConfig({
    id: "primary",
    overlayToken: env.OVERLAY_ALLOWED_TOKEN ?? "local-dev-overlay-token",
    shopId: env.TIKTOK_SHOP_ID,
    shopCipher: env.TIKTOK_SHOP_CIPHER,
    accessToken: env.TIKTOK_ACCESS_TOKEN,
    refreshToken: env.TIKTOK_REFRESH_TOKEN,
    appKey: env.TIKTOK_APP_KEY,
    appSecret: env.TIKTOK_APP_SECRET
  });
  const storeTwo = buildNumberedStoreConfig(env, 2, "store2");
  const storeThree = buildNumberedStoreConfig(env, 3, "store3");
  const stores = [
    primaryStore,
    ...(storeTwo ? [storeTwo] : []),
    ...(storeThree ? [storeThree] : [])
  ];

  return {
    port: Number(env.PORT ?? 3001),
    overlayAllowedToken: primaryStore.overlayToken,
    stores,
    tiktokApiBaseUrl: env.TIKTOK_API_BASE_URL ?? "https://open-api.tiktokglobalshop.com",
    tiktokAuthBaseUrl: env.TIKTOK_AUTH_BASE_URL ?? "https://auth.tiktok-shops.com",
    tiktokApiVersion: env.TIKTOK_API_VERSION ?? "202309",
    tiktokAppKey: env.TIKTOK_APP_KEY || undefined,
    tiktokAppSecret: env.TIKTOK_APP_SECRET || undefined,
    tiktokShopId: env.TIKTOK_SHOP_ID || undefined,
    tiktokShopCipher: env.TIKTOK_SHOP_CIPHER || undefined,
    tiktokAccessToken: env.TIKTOK_ACCESS_TOKEN || undefined,
    tiktokRefreshToken: env.TIKTOK_REFRESH_TOKEN || undefined,
    tiktokWebhookSecret: env.TIKTOK_WEBHOOK_SECRET || undefined,
    tiktokWebhookVerifyBypass: env.TIKTOK_WEBHOOK_VERIFY_BYPASS === "true",
    labelPrintRules: buildLabelPrintRules(env),
    hasTikTokCredentials: Boolean(
      env.TIKTOK_APP_KEY &&
        env.TIKTOK_APP_SECRET &&
        (env.TIKTOK_SHOP_CIPHER || env.TIKTOK_SHOP_ID) &&
        env.TIKTOK_ACCESS_TOKEN
    )
  };
}

function buildLabelPrintRules(env: NodeJS.ProcessEnv): LabelPrintRule[] {
  const candidates = [
    {
      shopId: env.LABEL_PRINT_SHOP_ID || "7495210574874380572",
      warehouseId: env.LABEL_PRINT_WAREHOUSE_ID || "7581531451641317175"
    },
    {
      shopId: env.LABEL_PRINT_SHOP_ID_2 || "7495180900215261343",
      warehouseId: env.LABEL_PRINT_WAREHOUSE_ID_2 || "7263214411597498155"
    },
    {
      shopId: env.LABEL_PRINT_SHOP_ID_3,
      warehouseId: env.LABEL_PRINT_WAREHOUSE_ID_3
    }
  ];

  return candidates.filter((rule): rule is LabelPrintRule =>
    Boolean(rule.shopId && rule.warehouseId)
  );
}

function buildNumberedStoreConfig(
  env: NodeJS.ProcessEnv,
  storeNumber: number,
  id: string
): TikTokStoreConfig | undefined {
  const prefix = `TIKTOK_STORE${storeNumber}`;
  const overlayToken = env[`${prefix}_OVERLAY_TOKEN`] ?? env[`OVERLAY_ALLOWED_TOKEN_STORE${storeNumber}`];

  return overlayToken
    ? buildStoreConfig({
        id,
        overlayToken,
        shopId: env[`${prefix}_SHOP_ID`],
        shopCipher: env[`${prefix}_SHOP_CIPHER`],
        accessToken: env[`${prefix}_ACCESS_TOKEN`],
        refreshToken: env[`${prefix}_REFRESH_TOKEN`],
        appKey: env.TIKTOK_APP_KEY,
        appSecret: env.TIKTOK_APP_SECRET
      })
    : undefined;
}

function buildStoreConfig({
  id,
  overlayToken,
  shopId,
  shopCipher,
  accessToken,
  refreshToken,
  appKey,
  appSecret
}: {
  id: string;
  overlayToken: string;
  shopId: string | undefined;
  shopCipher: string | undefined;
  accessToken: string | undefined;
  refreshToken: string | undefined;
  appKey: string | undefined;
  appSecret: string | undefined;
}): TikTokStoreConfig {
  return {
    id,
    overlayToken,
    tiktokShopId: shopId || undefined,
    tiktokShopCipher: shopCipher || undefined,
    tiktokAccessToken: accessToken || undefined,
    tiktokRefreshToken: refreshToken || undefined,
    hasTikTokCredentials: Boolean(
      appKey && appSecret && (shopCipher || shopId) && accessToken
    )
  };
}
