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
  hasTikTokCredentials: boolean;
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
  const storeTwoOverlayToken = env.TIKTOK_STORE2_OVERLAY_TOKEN ?? env.OVERLAY_ALLOWED_TOKEN_STORE2;
  const storeTwo = storeTwoOverlayToken
    ? buildStoreConfig({
        id: "store2",
        overlayToken: storeTwoOverlayToken,
        shopId: env.TIKTOK_STORE2_SHOP_ID,
        shopCipher: env.TIKTOK_STORE2_SHOP_CIPHER,
        accessToken: env.TIKTOK_STORE2_ACCESS_TOKEN,
        refreshToken: env.TIKTOK_STORE2_REFRESH_TOKEN,
        appKey: env.TIKTOK_APP_KEY,
        appSecret: env.TIKTOK_APP_SECRET
      })
    : undefined;
  const stores = [primaryStore, ...(storeTwo ? [storeTwo] : [])];

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
    hasTikTokCredentials: Boolean(
      env.TIKTOK_APP_KEY &&
        env.TIKTOK_APP_SECRET &&
        (env.TIKTOK_SHOP_CIPHER || env.TIKTOK_SHOP_ID) &&
        env.TIKTOK_ACCESS_TOKEN
    )
  };
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
