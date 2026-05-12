import "dotenv/config";

export type AppConfig = {
  port: number;
  overlayAllowedToken: string;
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

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3001),
    overlayAllowedToken: env.OVERLAY_ALLOWED_TOKEN ?? "local-dev-overlay-token",
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
        env.TIKTOK_SHOP_CIPHER &&
        env.TIKTOK_ACCESS_TOKEN
    )
  };
}
