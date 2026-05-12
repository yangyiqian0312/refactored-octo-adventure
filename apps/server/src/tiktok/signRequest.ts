import crypto from "node:crypto";

export type TikTokSignInput = {
  path: string;
  query: Record<string, string | number | boolean | undefined>;
  body?: string;
  appSecret: string;
};

export function signTikTokRequest({ path, query, body = "", appSecret }: TikTokSignInput): string {
  const parameterString = Object.entries(query)
    .filter(([key, value]) => key !== "sign" && key !== "access_token" && value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}${String(value)}`)
    .join("");
  const payload = `${appSecret}${path}${parameterString}${body}${appSecret}`;

  return crypto.createHmac("sha256", appSecret).update(payload).digest("hex");
}
