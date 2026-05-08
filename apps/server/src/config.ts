import "dotenv/config";

export type AppConfig = {
  port: number;
  overlayAllowedToken: string;
  tiktokWebhookSecret: string | undefined;
  tiktokWebhookVerifyBypass: boolean;
  hasTikTokCredentials: boolean;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: Number(env.PORT ?? 3001),
    overlayAllowedToken: env.OVERLAY_ALLOWED_TOKEN ?? "local-dev-overlay-token",
    tiktokWebhookSecret: env.TIKTOK_WEBHOOK_SECRET || undefined,
    tiktokWebhookVerifyBypass: env.TIKTOK_WEBHOOK_VERIFY_BYPASS === "true",
    hasTikTokCredentials: Boolean(
      env.TIKTOK_APP_KEY &&
        env.TIKTOK_APP_SECRET &&
        env.TIKTOK_SHOP_ID &&
        env.TIKTOK_ACCESS_TOKEN
    )
  };
}
