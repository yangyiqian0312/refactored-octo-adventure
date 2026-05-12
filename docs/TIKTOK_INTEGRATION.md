# TikTok Shop Integration Notes

This MVP is built for the intended production data path:

```text
TikTok Shop webhook
-> backend receives order status event
-> backend verifies webhook
-> backend calls TikTok Shop Order API for order details if needed
-> backend normalizes safe display fields
-> backend emits overlay event
```

No unofficial scraping is implemented. The app does not read orders from TikTok Live Studio.

## Webhook Endpoint

```text
POST /webhooks/tiktok
```

Current MVP behavior:

- reads the raw JSON request body string
- verifies the signature through `apps/server/src/tiktok/webhookVerifier.ts`
- supports local unsigned testing only when `TIKTOK_WEBHOOK_VERIFY_BYPASS=true`
- parses the event with a permissive Zod schema
- extracts `event_id` or `eventId`
- extracts a possible notification id from `tts_notification_id`, `event_id`, or `eventId`
- extracts a possible order id from `data.order_id`, `order_id`, or `orderId`
- extracts order status from `data.order_status` when present
- creates OBS alerts only for `AWAITING_SHIPMENT`, which represents a paid order ready for shipment; all other order status webhooks are ignored for overlay alerts
- deduplicates by `order id + status` when available, otherwise event id
- stores raw webhook payloads in memory for local debugging
- emits a normalized alert only if safe display fields are present or mocked in the payload

## Signature Verification

Production verification is not claimed complete.

`webhookVerifier.ts` currently has a dedicated placeholder verifier. If `TIKTOK_WEBHOOK_SECRET` is missing and local bypass is disabled, it fails closed.

Before production:

- replace the placeholder HMAC fallback with the exact official TikTok Shop Partner webhook verification algorithm
- confirm the correct signature header names
- confirm canonical payload construction
- add official schema examples to tests
- keep the fail-closed behavior for missing or invalid configuration

## Order Detail Lookup

`apps/server/src/tiktok/client.ts` contains `TikTokOrderClient` and `PlaceholderTikTokOrderClient`.

Before production:

- implement official TikTok Shop Partner API request signing
- use official order endpoint paths and required headers
- handle token refresh if required by the app model
- apply rate-limit and retry guidance from official docs
- validate API responses with Zod before normalization

## Required Environment Variables

```bash
PORT=3001
OVERLAY_ALLOWED_TOKEN=local-dev-overlay-token

TIKTOK_API_BASE_URL=https://open-api.tiktokglobalshop.com
TIKTOK_AUTH_BASE_URL=https://auth.tiktok-shops.com
TIKTOK_API_VERSION=202309
TIKTOK_APP_KEY=
TIKTOK_APP_SECRET=
TIKTOK_SHOP_ID=
TIKTOK_ACCESS_TOKEN=
TIKTOK_REFRESH_TOKEN=

TIKTOK_WEBHOOK_SECRET=
TIKTOK_WEBHOOK_VERIFY_BYPASS=true
```

`TIKTOK_WEBHOOK_VERIFY_BYPASS=true` is for local development only.

## Privacy Rules

Never display or log:

- full legal name
- shipping address
- phone number
- email address
- payment information
- full raw order id
- internal notes

Allowed overlay fields:

- masked buyer name
- safe TikTok username
- product title
- quantity
- generic celebration text

If buyer name is missing or looks private, display:

```text
Someone
```
