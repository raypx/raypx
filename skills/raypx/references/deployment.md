# Deployment

Web and API are separate Bun services. See [deployment](../../../docs/development/deployment.md).

- `bun run build:web` / `build:api`, then run `bun .output/server/index.mjs`
  (Nitro bun preset), or use the existing Dockerfiles.
- Production API requires `DATABASE_URL`, `AUTH_URL`, `AUTH_SECRET` and
  `ALLOWED_ORIGINS`; use HTTPS and exact origins. `VITE_API_URL` is baked into Web.
- Web's server must receive the session cookie: same origin or `AUTH_DOMAIN`.
- Desktop: `bun run package:desktop` packages it with its CLI on macOS/Windows.
