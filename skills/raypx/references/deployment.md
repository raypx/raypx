# Deployment

Web and API are separate services with two targets each. See
[dual deployment targets](../../../docs/development/cloudflare.md).

- **Node** (default): `bun run build:web` / `build:api`, then run
  `node .output/server/index.mjs` on Node 24.15.0 (Nitro node-server).
- **Cloudflare Workers**: `bun run build:web:cloudflare` / `build:api:cloudflare`
  (`.output-cloudflare`), `preview:*:cloudflare`, then `deploy:*:cloudflare`.
  Hyperdrive is optional for API.
- Production API requires `DATABASE_URL`, `AUTH_URL`, `AUTH_SECRET` and
  `ALLOWED_ORIGINS`; use HTTPS and exact origins. `VITE_API_URL` is baked into Web.
- Web's server must receive the session cookie: same origin or `AUTH_DOMAIN`.
- Desktop: `bun run package:desktop` packages it with its CLI on macOS/Windows.
