# api

## Purpose

The Node HTTP composition root for authentication and account RPC.

## Interface

`/api/auth/*` delegates to Better Auth. `/rpc/*` serves the explicit oRPC account
contract. `/health` reports process liveness without querying PostgreSQL.
Every other path is a JSON 404; Web is a separate service.

## Ownership

Nitro owns one listener and the close lifecycle. Hono owns the Fetch application.
API composes the database adapter, mailer and auth factory, once per process.
Account RPC uses `@raypx/account/server` with an injected session reader. The
service projects public fields; API owns HTTP and unauthorized/error mapping.

## Constraints

- Dev and build run vp under Node (`bun vp`, never `bun --bun vp`); start
  `.output/server/index.mjs` on Node 24.15.0 with the Nitro node-server preset.
- Never host Web pages or assets. Optional AUTH_DOMAIN shares session cookies
  with a Web host on a sibling subdomain so its server rendering sees the session.
- Resolve the Better Auth session on every account RPC; never accept actor IDs.
- Production requires explicit DATABASE_URL, AUTH_URL, AUTH_SECRET and ALLOWED_ORIGINS.
- Use HTTPS and secure cookies in production, exact trusted origins only.
- Close the PostgreSQL connection idempotently through Nitro's close hook.
- No old business endpoints, worker, local execution endpoints or second server.
- Unconfigured mail actions return MAIL_NOT_CONFIGURED before Better Auth dispatch;
  startup, liveness and existing sign-in remain available.
- Never import another app. Local CLI execution stays outside the HTTP API.
- Runtime initializes `@voidmix/logger` once and flushes it on Nitro shutdown.
  Hono owns non-RPC events; the matching `@orpc/evlog` plugin owns RPC events.
  Preserve the server-generated request ID in responses, errors and diagnostics.
  Log route templates and safe error summaries, never request/response bodies,
  credentials, raw URLs or query strings. Logging does not change error contracts.

## Verification

```sh
bun run --cwd apps/api check
bun run --cwd apps/api test
bun run build:api
TEST_DATABASE_URL=postgres://localhost/raypx_foundation_test bun run --cwd apps/api test:postgres
```
