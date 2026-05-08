import { z } from "zod";

export const tiktokWebhookPayloadSchema = z
  .object({
    event_id: z.string().optional(),
    eventId: z.string().optional(),
    type: z.string().optional(),
    event_type: z.string().optional(),
    data: z.unknown().optional(),
    order_id: z.string().optional(),
    orderId: z.string().optional(),
    status: z.string().optional()
  })
  .passthrough();

export type TikTokWebhookPayload = z.infer<typeof tiktokWebhookPayloadSchema>;
