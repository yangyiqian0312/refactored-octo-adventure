import crypto from "node:crypto";

export type WebhookVerifierOptions = {
  secret: string | undefined;
  allowLocalBypass: boolean;
};

export type WebhookVerificationResult =
  | { ok: true; mode: "verified" | "local-bypass" }
  | { ok: false; reason: string };

export function verifyTikTokWebhookSignature(
  rawBody: string,
  headers: Record<string, string | string[] | undefined>,
  options: WebhookVerifierOptions
): WebhookVerificationResult {
  if (!options.secret) {
    if (options.allowLocalBypass) {
      return { ok: true, mode: "local-bypass" };
    }

    return { ok: false, reason: "TIKTOK_WEBHOOK_SECRET is required when bypass is disabled" };
  }

  const signature = firstHeader(headers["x-tiktok-signature"] ?? headers["x-tts-signature"]);

  if (!signature) {
    return { ok: false, reason: "missing TikTok webhook signature header" };
  }

  // TODO: Replace this fallback HMAC with the exact TikTok Shop Partner webhook
  // verification algorithm from official documentation before production use.
  const expected = crypto.createHmac("sha256", options.secret).update(rawBody).digest("hex");
  const normalizedSignature = signature.replace(/^sha256=/i, "");

  if (!timingSafeEqualHex(expected, normalizedSignature)) {
    return { ok: false, reason: "invalid TikTok webhook signature" };
  }

  return { ok: true, mode: "verified" };
}

function firstHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function timingSafeEqualHex(expected: string, actual: string): boolean {
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(actual, "hex");

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}
