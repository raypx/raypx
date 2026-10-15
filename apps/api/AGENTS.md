# api

## Purpose

The Node HTTP composition root for authentication, account RPC and the Web SPA.

## Interface

`/api/auth/*` delegates to Better Auth. `/rpc/*` serves the explicit oRPC account
contract. `/health` reports process liveness without querying PostgreSQL.
HTML GET/HEAD navigation falls back to the bundled Web index; API misses and
missing assets remain 404.

## Ownership

Nitro owns one listener and the close lifecycle. Hono owns the Fetch application.
API composes the database adapter, mailer and auth factory, once per process.

## Constraints

- Build with Vite + Nitro node-server and start `.output/server/index.mjs` on Node 24.
- Build Web first; Nitro copies its public assets and bundles its index.
- Resolve the Better Auth session on every account RPC; never accept actor IDs.
- Production requires explicit DATABASE_URL, AUTH_URL, AUTH_SECRET and ALLOWED_ORIGINS.
- Use HTTPS and secure cookies in production, exact trusted origins only.
- Close the PostgreSQL connection idempotently through Nitro's close hook.
- No old business endpoints, worker, local execution endpoints or second server.
- Unconfigured mail actions return MAIL_NOT_CONFIGURED before Better Auth dispatch;
  startup, liveness and existing sign-in remain available.
- Never import another app. Local CLI execution stays outside the HTTP API.

## Verification

```sh
bun run --cwd apps/api check
bun run --cwd apps/api test
bun run build:api
TEST_DATABASE_URL=postgres://localhost/raypx_foundation_test bun run --cwd apps/api test:postgres
```
