import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTikTokWebhookSignature } from "./webhookVerifier.js";

describe("verifyTikTokWebhookSignature", () => {
  it("fails closed when no secret is configured and bypass is disabled", () => {
    const result = verifyTikTokWebhookSignature("{}", {}, { secret: undefined, allowLocalBypass: false });

    expect(result.ok).toBe(false);
  });

  it("allows local bypass only when explicitly enabled", () => {
    const result = verifyTikTokWebhookSignature("{}", {}, { secret: undefined, allowLocalBypass: true });

    expect(result).toEqual({ ok: true, mode: "local-bypass" });
  });

  it("accepts the documented placeholder HMAC shape", () => {
    const rawBody = "{\"event_id\":\"evt_1\"}";
    const secret = "local-secret";
    const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
    const result = verifyTikTokWebhookSignature(
      rawBody,
      { "x-tiktok-signature": `sha256=${signature}` },
      { secret, allowLocalBypass: false }
    );

    expect(result).toEqual({ ok: true, mode: "verified" });
  });
});
