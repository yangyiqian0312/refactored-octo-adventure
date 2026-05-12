import { z } from "zod";
import { signTikTokRequest } from "./signRequest.js";

export type TikTokTokenExchangeOptions = {
  authBaseUrl: string;
  apiBaseUrl: string;
  apiVersion: string;
  appKey: string;
  appSecret: string;
};

export type TikTokTokenData = {
  accessToken: string;
  accessTokenExpireIn?: number;
  refreshToken: string;
  refreshTokenExpireIn?: number;
  openId?: string;
  sellerName?: string;
  sellerBaseRegion?: string;
  grantedScopes: string[];
};

export type TikTokAuthorizedShop = {
  id: string;
  cipher: string;
  name: string;
  region?: string;
  sellerType?: string;
};

const tokenResponseSchema = z
  .object({
    code: z.number(),
    message: z.string().optional(),
    request_id: z.string().optional(),
    data: z
      .object({
        access_token: z.string(),
        access_token_expire_in: z.number().optional(),
        refresh_token: z.string(),
        refresh_token_expire_in: z.number().optional(),
        open_id: z.string().optional(),
        seller_name: z.string().optional(),
        seller_base_region: z.string().optional(),
        granted_scopes: z.array(z.string()).optional()
      })
      .passthrough()
      .optional()
  })
  .passthrough();

const shopsResponseSchema = z
  .object({
    code: z.number(),
    message: z.string().optional(),
    request_id: z.string().optional(),
    data: z
      .object({
        shops: z.array(
          z
            .object({
              id: z.string(),
              cipher: z.string(),
              name: z.string(),
              region: z.string().optional(),
              seller_type: z.string().optional()
            })
            .passthrough()
        )
      })
      .passthrough()
      .optional()
  })
  .passthrough();

export async function exchangeTikTokAuthCode(
  code: string,
  options: TikTokTokenExchangeOptions
): Promise<TikTokTokenData> {
  const url = new URL("/api/v2/token/get", options.authBaseUrl);

  url.searchParams.set("app_key", options.appKey);
  url.searchParams.set("app_secret", options.appSecret);
  url.searchParams.set("auth_code", code);
  url.searchParams.set("grant_type", "authorized_code");

  const response = await fetch(url, { method: "GET" });
  const parsed = tokenResponseSchema.parse(await response.json());

  if (!response.ok || parsed.code !== 0 || !parsed.data) {
    throw new Error(parsed.message ?? `TikTok token exchange failed with HTTP ${response.status}`);
  }

  const tokenData: TikTokTokenData = {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
    grantedScopes: parsed.data.granted_scopes ?? []
  };

  if (parsed.data.access_token_expire_in !== undefined) {
    tokenData.accessTokenExpireIn = parsed.data.access_token_expire_in;
  }

  if (parsed.data.refresh_token_expire_in !== undefined) {
    tokenData.refreshTokenExpireIn = parsed.data.refresh_token_expire_in;
  }

  if (parsed.data.open_id) {
    tokenData.openId = parsed.data.open_id;
  }

  if (parsed.data.seller_name) {
    tokenData.sellerName = parsed.data.seller_name;
  }

  if (parsed.data.seller_base_region) {
    tokenData.sellerBaseRegion = parsed.data.seller_base_region;
  }

  return tokenData;
}

export async function getTikTokAuthorizedShops(
  accessToken: string,
  options: TikTokTokenExchangeOptions
): Promise<TikTokAuthorizedShop[]> {
  const path = `/authorization/${options.apiVersion}/shops`;
  const timestamp = Math.floor(Date.now() / 1000);
  const query = {
    app_key: options.appKey,
    timestamp,
    version: options.apiVersion
  };
  const sign = signTikTokRequest({
    path,
    query,
    appSecret: options.appSecret
  });
  const url = new URL(path, options.apiBaseUrl);

  for (const [key, value] of Object.entries({ ...query, sign })) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "content-type": "application/json",
      "x-tts-access-token": accessToken
    }
  });
  const parsed = shopsResponseSchema.parse(await response.json());

  if (!response.ok || parsed.code !== 0) {
    throw new Error(parsed.message ?? `TikTok authorized shops failed with HTTP ${response.status}`);
  }

  return (parsed.data?.shops ?? []).map((shop) => {
    const authorizedShop: TikTokAuthorizedShop = {
      id: shop.id,
      cipher: shop.cipher,
      name: shop.name
    };

    if (shop.region) {
      authorizedShop.region = shop.region;
    }

    if (shop.seller_type) {
      authorizedShop.sellerType = shop.seller_type;
    }

    return authorizedShop;
  });
}
