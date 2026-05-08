# OBS Setup

1. Start the local dev servers:

```bash
pnpm dev
```

2. In OBS, add a new `Browser Source`.

3. Use this URL:

```text
http://localhost:5173/overlay?server=http://localhost:3001&token=local-dev-overlay-token
```

Add `&debug=1` while testing connection state.

4. Set Browser Source size:

```text
Width: 1080
Height: 1920
```

5. Keep the overlay source above camera/background layers.

6. If OBS offers a transparent background option, enable it. The overlay page itself uses a transparent background.

7. Trigger a fake order:

```bash
curl -X POST http://localhost:3001/api/test-order \
  -H "Content-Type: application/json" \
  -d '{"buyerName":"m***23","productTitle":"Pokemon Booster Pack","quantity":3,"imageUrl":"https://placehold.co/300x300"}'
```

The alert should animate near the lower part of the vertical canvas and then disappear.
