import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTikTokWebhookSignature } from "./webhookVerifier.js";

describe("verifyTikTokWebhookSignature", () => {
  it("fails closed when no secret is configured and bypass is disabled", () => {
    const result = verifyTikTokWebhookSignature("{}", {}, {
      appKey: undefined,
      secret: undefined,
      allowLocalBypass: false
    });

    expect(result.ok).toBe(false);
  });

  it("allows local bypass only when explicitly enabled", () => {
    const result = verifyTikTokWebhookSignature("{}", {}, {
      appKey: undefined,
      secret: undefined,
      allowLocalBypass: true
    });

    expect(result).toEqual({ ok: true, mode: "local-bypass" });
  });

  it("accepts the official Authorization HMAC shape", () => {
    const rawBody = "{\"event_id\":\"evt_1\"}";
    const appKey = "app-key";
    const secret = "local-secret";
    const signature = crypto.createHmac("sha256", secret).update(`${appKey}${rawBody}`).digest("hex");
    const result = verifyTikTokWebhookSignature(
      rawBody,
      { authorization: signature },
      { appKey, secret, allowLocalBypass: false }
    );

    expect(result).toEqual({ ok: true, mode: "verified" });
  });
});
