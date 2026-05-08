# TikTok Shop Live Order Overlay MVP

Local MVP for a TikTok Shop live-order alert overlay in OBS.

TikTok Shop order event -> backend webhook/order processor -> normalized order alert -> Socket.IO -> browser overlay -> OBS Browser Source.

This is not a Shopify integration. The app does not scrape TikTok or TikTok Live Studio.

## Apps

- `apps/server`: Fastify + Socket.IO backend.
- `apps/overlay`: Vite + React transparent OBS overlay.
- `packages/shared`: shared Zod schemas, types, and tier logic.
- `docs`: OBS and TikTok integration notes.

## Setup

```bash
corepack enable
pnpm install
cp .env.example .env
pnpm dev
```

If `pnpm` is not available on PATH, use `corepack pnpm install` and `corepack pnpm dev`.

Server runs on `http://localhost:3001`.
Overlay runs on `http://localhost:5173`.

Open:

```text
http://localhost:5173/overlay?server=http://localhost:3001&token=local-dev-overlay-token&debug=1
```

The Vite dev server serves the same React app for `/overlay`.

## Fake Test Order

```bash
curl -X POST http://localhost:3001/api/test-order \
  -H "Content-Type: application/json" \
  -d '{"buyerName":"m***23","productTitle":"Pokemon Booster Pack","quantity":3,"imageUrl":"https://placehold.co/300x300"}'
```

Expected overlay text:

```text
m***23 just bought 3x Pokemon Booster Pack
```

Send several requests quickly. Alerts should play one at a time.

## API

```text
GET  /health
POST /api/test-order
GET  /api/recent-alerts
POST /webhooks/tiktok
```

Socket.IO event:

```ts
socket.emit("order:created", orderAlert)
```

Overlay connections require the `OVERLAY_ALLOWED_TOKEN` value via query/auth token.

## Commands

```bash
pnpm dev
pnpm build
pnpm test
pnpm lint
pnpm typecheck
```

## Environment

See `.env.example`.

`TIKTOK_WEBHOOK_VERIFY_BYPASS=true` is intended only for local development. Production mode must configure `TIKTOK_WEBHOOK_SECRET`; otherwise the webhook verifier fails closed.

## Privacy

The overlay displays only safe fields:

- masked buyer display name or `Someone`
- product title
- quantity
- product image URL

Do not display shipping address, phone, email, payment data, full legal name, full raw order id, or internal notes.

## Production TikTok TODOs

The webhook route exists and is safe for local unsigned payloads only when bypass is enabled. The signature verifier is isolated in `apps/server/src/tiktok/webhookVerifier.ts`, but the exact production TikTok Shop signature algorithm still needs to be implemented from official TikTok Shop Partner API documentation before real deployment.

Order detail lookup is represented by `apps/server/src/tiktok/client.ts` and must be completed with official endpoint paths, request signing, headers, rate-limit behavior, and response schemas.

More notes: [docs/TIKTOK_INTEGRATION.md](docs/TIKTOK_INTEGRATION.md).

## Free Deployment Shape

Recommended free-friendly setup:

- Render free web service for `apps/server`
- Vercel Hobby static deployment for `apps/overlay`

TikTok webhook URL:

```text
https://your-render-service.onrender.com/webhooks/tiktok
```

OBS Browser Source URL:

```text
https://your-vercel-app.vercel.app/overlay?server=https://your-render-service.onrender.com&token=your-overlay-token
```
