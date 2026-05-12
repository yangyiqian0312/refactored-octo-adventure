import { z } from "zod";

export const tiktokWebhookPayloadSchema = z.record(z.string(), z.unknown());

export type TikTokWebhookPayload = z.infer<typeof tiktokWebhookPayloadSchema>;
