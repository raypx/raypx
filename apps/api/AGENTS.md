# api

## Purpose

The Node and Cloudflare Workers HTTP composition root for authentication and account RPC.

## Interface

`/api/auth/*` delegates to Better Auth. `/rpc/*` serves the explicit oRPC account
contract. `/health` reports process liveness without querying PostgreSQL.
Every other path is a JSON 404; Web is a separate service.

All API tests live in `tests/`; keep `server/` for runtime modules. `unit/` and
`integration/` form the default database-free gate. `postgres/node/` and
`postgres/cloudflare/` use the `postgres` and `cloudflare-postgres` modes of
`vitest.config.ts` for real-database tests.
Use directories for test kind and runtime; filenames describe the behavior under test.

## Ownership

Nitro owns the platform entry. Hono owns the shared Fetch application.
Platform entry modules live in `app/`; runtime composition and adapters live in `runtime/`.
`runtime/shared.ts` composes the injected database, logger, mailer and auth factory.
`runtime/node.ts` initializes one process runtime, closed by `runtime/plugin.ts` through Nitro's close hook.
`app/cloudflare.ts` creates a request runtime from bindings, then schedules cleanup
with `waitUntil`. Workers reuse the console logger, never a database client or auth context.
Account RPC uses `@raypx/account/server` with an injected session reader. The
service projects public fields; API owns HTTP and unauthorized/error mapping.

## Constraints

- Dev and build run vp under Node (`bun vp`, never `bun --bun vp`); start
  `.output/server/index.mjs` on Node 24.15.0 with the default Nitro node-server preset.
  `build:cloudflare` selects Vite's cloudflare mode and produces `.output-cloudflare`.
  Common target options come from `@raypx/tooling/build/nitro`; API owns routes and runtime plugins.
  Keep Worker bindings inside the request lifecycle and migrations outside Worker imports.
  Hyperdrive is optional; when present it supplies the connection string. Its auth
  configuration must disable query caching so session revocation remains immediate.
- Never host Web pages or assets. Optional AUTH_DOMAIN shares session cookies
  with a Web host on a sibling subdomain so its server rendering sees the session.
- Resolve the Better Auth session on every account RPC; never accept actor IDs.
- Production requires explicit DATABASE_URL, AUTH_URL, AUTH_SECRET and ALLOWED_ORIGINS.
- Use HTTPS and secure cookies in production, exact trusted origins only.
- Close Node's PostgreSQL pool idempotently through Nitro's close hook. Worker requests
  close their own client and flush the shared logger without closing it for other requests.
- No old business endpoints, worker, local execution endpoints or second server.
- Unconfigured mail actions return MAIL_NOT_CONFIGURED before Better Auth dispatch;
  startup, liveness and existing sign-in remain available.
- Never import another app. Local CLI execution stays outside the HTTP API.
- Runtime configures `@raypx-kit/logger` (evlog) once through `server/logging.ts`: events pass the
  explicit `API_LOG_FIELDS` policy and a bounded pipeline, and are flushed on Nitro shutdown.
  Hono owns non-RPC events; the matching `@orpc/evlog` plugin owns RPC events.
  Preserve the server-generated request ID in responses, errors and diagnostics.
  Log route templates and safe error summaries, never request/response bodies,
  credentials, raw URLs or query strings. Logging does not change error contracts.

## Verification

```sh
bun run --cwd apps/api check
bun run --cwd apps/api test
bun run build:api
bun run build:api:cloudflare
TEST_DATABASE_URL=postgres://localhost/raypx_foundation_test bun run --cwd apps/api test:postgres
TEST_DATABASE_URL=postgres://user:password@localhost/raypx_foundation_test bun run test:cloudflare:postgres
```
