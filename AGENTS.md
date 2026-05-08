# AGENTS.md

## Project summary

This repository implements a TikTok Shop live-order alert overlay for OBS.

The goal is:

TikTok Shop order event
→ backend webhook/order processor
→ normalized order alert event
→ realtime WebSocket
→ browser overlay
→ OBS Browser Source displays animation

This is not a Shopify integration. Do not implement Shopify-specific logic unless explicitly requested.

## Product requirements

Build an MVP that can:

1. Run locally.
2. Show a transparent browser overlay suitable for OBS at 1080x1920.
3. Accept fake test orders from a local API endpoint.
4. Queue order alerts so multiple orders do not overlap visually.
5. Play a visible order animation and optional sound.
6. Store or deduplicate order events.
7. Provide clear placeholders for TikTok Shop webhook verification and TikTok Shop Order API integration.
8. Avoid exposing private buyer data on screen.

The MVP should work before real TikTok credentials are available.

## Preferred architecture

Use a TypeScript monorepo:

- `apps/server`
  - Node.js TypeScript backend
  - Express or Fastify
  - Socket.IO server
  - REST endpoints
  - TikTok webhook route
  - test-order route
  - in-memory store for local MVP
  - storage abstraction so Postgres/Supabase can be added later

- `apps/overlay`
  - Vite + React + TypeScript
  - Socket.IO client
  - transparent background overlay
  - order alert queue
  - CSS animations
  - OBS-friendly layout

- `packages/shared`
  - shared TypeScript types
  - Zod schemas for order alert payloads

- `docs`
  - setup instructions
  - OBS setup guide
  - TikTok integration notes
  - environment variables

If the repo already has a different structure, adapt to it instead of forcing a rewrite.

## Technology choices

Prefer:

- TypeScript
- pnpm
- Vite
- React
- Socket.IO
- Zod
- ESLint
- Prettier
- Vitest

Avoid unnecessary heavy dependencies for the MVP.

Do not add animation libraries unless the CSS-only version becomes too messy. Start with CSS animations.

## Environment variables

Use `.env.example`. Never commit real secrets.

Expected variables:

```bash
PORT=3001
OVERLAY_ALLOWED_TOKEN=local-dev-overlay-token

TIKTOK_APP_KEY=
TIKTOK_APP_SECRET=
TIKTOK_SHOP_ID=
TIKTOK_ACCESS_TOKEN=

TIKTOK_WEBHOOK_SECRET=
TIKTOK_WEBHOOK_VERIFY_BYPASS=true
```

Rules:

- `TIKTOK_WEBHOOK_VERIFY_BYPASS=true` is allowed only for local development.
- Production code must fail closed if webhook signature verification is not configured.
- Never log access tokens, app secrets, webhook secrets, buyer address, phone, email, or payment details.

## Backend requirements

Implement these endpoints:

### `GET /health`

Returns:

```json
{ "ok": true }
```

### `POST /api/test-order`

Creates a fake order alert and broadcasts it to overlay clients.

Request example:

```json
{
  "buyerName": "m***23",
  "productTitle": "Pokemon Booster Pack",
  "quantity": 3,
  "imageUrl": "https://example.com/pack.png"
}
```

Response example:

```json
{
  "ok": true,
  "eventId": "..."
}
```

### `POST /webhooks/tiktok`

Receives TikTok Shop webhook events.

Initial MVP behavior:

1. Read raw request body.
2. Verify signature if verification is configured.
3. Parse event.
4. Extract a possible order id.
5. Deduplicate by event id and/or order id + status.
6. Return HTTP 200 quickly.
7. Process the event asynchronously.
8. For MVP, if real TikTok API credentials are missing, store the raw event and do not crash.
9. If order details are available or mocked, normalize into an `OrderAlert`.

Do not pretend the TikTok signature logic is complete unless it has been implemented according to the official TikTok Shop documentation. Put all signature verification logic in a dedicated module with tests.

### `GET /api/recent-alerts`

Returns recent normalized order alerts for debugging.

### Socket.IO

Broadcast event:

```ts
socket.emit("order:created", orderAlert)
```

The normalized order alert shape should be:

```ts
type OrderAlert = {
  id: string
  source: "test" | "tiktok"
  orderId?: string
  buyerDisplayName: string
  productTitle: string
  quantity: number
  imageUrl?: string
  createdAt: string
  tier: "normal" | "large" | "mega"
}
```

Tier rules for MVP:

- `normal`: quantity 1-2
- `large`: quantity 3-9
- `mega`: quantity >= 10

## TikTok integration rules

Do not use unofficial scraping.

Do not try to read TikTok orders from TikTok Live Studio.

The intended production data path is:

TikTok Shop webhook
→ backend receives order status event
→ backend verifies webhook
→ backend calls TikTok Shop Order API for order details if needed
→ backend normalizes safe display fields
→ backend emits overlay event

Use official TikTok Shop Partner API docs for final request signing, endpoint paths, required headers, rate limits, and webhook event schema.

If credentials or exact API details are unavailable, implement the integration behind interfaces and include TODO comments that are explicit and honest.

Suggested modules:

```text
apps/server/src/tiktok/
  client.ts
  webhookVerifier.ts
  normalizeOrder.ts
  types.ts
```

## Privacy requirements

The overlay must never display:

- full legal name
- shipping address
- phone number
- email address
- payment information
- full raw order id
- internal notes

Allowed display fields:

- masked buyer name
- TikTok username if available and safe
- product title
- quantity
- generic order celebration text

Default display text:

```text
m***23 just bought 3x Pokemon Booster Pack
```

If buyer name is missing, use:

```text
Someone
```

## Overlay requirements

The overlay should:

1. Use transparent background.
2. Be designed for 1080x1920 vertical canvas.
3. Connect to the backend Socket.IO server.
4. Authenticate using an overlay token query parameter.
5. Queue alerts.
6. Display one alert at a time.
7. Auto-hide each alert after 3-5 seconds.
8. Handle reconnects.
9. Show a small connection/debug indicator only when `?debug=1` is present.
10. Be usable as an OBS Browser Source.

Example OBS URL:

```text
http://localhost:5173/overlay?server=http://localhost:3001&token=local-dev-overlay-token
```

Do not require user login for the overlay MVP.

## OBS requirements

Document how to add the overlay to OBS:

- Add Browser Source
- URL: overlay URL
- Width: 1080
- Height: 1920
- Enable transparent background if needed
- Keep overlay source above camera/background layers

## Testing requirements

Add tests where practical.

Minimum tests:

- Zod validation for `OrderAlert`
- order tier calculation
- queue behavior in overlay if easy to isolate
- webhook dedupe behavior
- webhook verifier fail-closed behavior

Commands should exist:

```bash
pnpm install
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

If a command is unavailable, add it or document why.

Before finishing a task, run:

```bash
pnpm typecheck
pnpm test
pnpm build
```

If any command fails due to missing credentials or environment, document the failure clearly and ensure local fake-order mode still works.

## Code style

- Use strict TypeScript.
- Prefer small modules.
- Avoid large files.
- Validate external input with Zod.
- Keep API types shared between server and overlay.
- Use descriptive names.
- Do not silently swallow errors.
- Log structured, sanitized errors.
- Never log secrets or private buyer data.

## Deliverables for feature work

When implementing a feature, include:

1. Code changes.
2. Tests or explanation for missing tests.
3. Updated docs.
4. Updated `.env.example` if new env vars are added.
5. Manual verification steps.

## Definition of done for MVP

The MVP is done when:

1. `pnpm dev` starts server and overlay.
2. User can open the overlay in a browser.
3. User can add the overlay URL as OBS Browser Source.
4. `POST /api/test-order` triggers an on-screen alert.
5. Multiple test orders queue instead of overlapping.
6. TikTok webhook endpoint exists and safely handles unsigned local test payloads only when local bypass is enabled.
7. Production webhook mode fails closed without verifier configuration.
8. README explains setup, test order, OBS usage, and TikTok production TODOs.