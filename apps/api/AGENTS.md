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
Use directories for test kind and runtime; filenames describe the behavior under test. Worker PostgreSQL suites share `tests/helpers/worker.ts` for subprocess lifecycle and bounded redacted diagnostics; each suite owns its database setup and assertions.

## Ownership

Nitro owns the platform entry. Hono owns the shared Fetch application.
Platform entry modules live in `app/`; runtime composition and adapters live in `runtime/`.
`runtime/shared.ts` composes services from the injected database, logger and providers.
`runtime/adapters.ts` picks each adapter (override, then Redis/S3 when configured, then
PostgreSQL/memory/unavailable) and builds the auth config; `runtime/lifecycle.ts` closes
owned resources in reverse order, every one even after a failure, and only once.
`runtime/node.ts` initializes one process runtime, closed by `runtime/plugin.ts` through Nitro's close hook.
`app/cloudflare.ts` creates a request runtime from bindings, then schedules cleanup
with `waitUntil`. Workers reuse the console logger, never a database client or auth context.
Account RPC uses `@raypx/account/server` with an injected session reader. The
service projects public fields; API owns HTTP and unauthorized/error mapping.

`jobs/` owns server maintenance; `jobs/runtime/` contains the Nitro Task entries.
`maintenance:cleanup` runs every 15 minutes on Node and Cloudflare, gated by
`JOBS_ENABLED` (false by default). Keep Nitro's schedule and Wrangler triggers aligned.
Cleanup uses PostgreSQL transaction time, an advisory transaction lock and bounded
row-locked batches. Sessions/verification records expired over 24 hours ago,
rate limits older than one hour and terminal projections of revoked devices are eligible. Failure rolls back and retries
on the next schedule. Never add a production HTTP task runner or log driver errors.
Node tasks reuse the API runtime; Worker tasks create and close an event-owned one.
See `docs/development/server-jobs.md` for policy and verification.

`schedules:tick` runs every minute on both platforms with the same deployment gate.
`@raypx/jobs/server` owns scheduling use cases; API supplies PostgreSQL persistence
and the private relay executor. `jobs.*` RPC resolves an account on every call;
writes additionally require a trusted Origin, revision checks and account limits.
Create request IDs are durable plan IDs; retries are checked before the 100-plan quota.
Due claims use DB time, row locks and unique schedule slots, skip missed occurrences
and advance only into the future. Active/unknown runs prevent overlap until an
authoritative task terminal projection; uncertainty pauses the plan without resending.
Internal checked-at ordering rotates reconciliation fairly across bounded batches.
Deleting a plan removes its run log, while existing managed tasks remain unchanged.

`memory.*` requires an account session on every read and write; mutations also require
trusted Origin, CAS and account limits. `@raypx/memory/server` owns shared use cases;
`server/memory/repository.ts` atomically stores current documents and immutable
versions. Resolve joins current eligibility with selected revisions without account
write locking. Sources are frozen on task creation and obey core's full prompt budget.
Context command replay bodies expire after 24 hours and are limited to 4096 rows/8 MiB
per account on acceptance. Bounded compaction retains unknown-delivery digest receipts;
only a matching authoritative task projection allows receipt deletion. Cleanup uses the
same compactor for expired bodies; partial indexes exclude already compacted receipts.

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
- Production rate limits share the `rate_limit` table: Better Auth limits auth routes
  by client IP. The Node entry overwrites `x-raypx-client-ip` with the socket address
  and uses it unless `AUTH_IP_HEADERS`/`AUTH_TRUSTED_PROXIES` describe a proxy;
  Workers use `cf-connecting-ip`. `server/rate-limit.ts` limits grant/ticket procedures per account (`RATE_LIMITED`).
  Keep RPC windows at or below 60 seconds, Better Auth's pruning horizon. Host grants
  have pre-lookup limits by platform-owned client address (120/min) and credential
  digest (6/min); never use a caller-selected forwarding header or raw bearer key.
- Optional `REDIS_URL` (Node only, `server/runtime/redis.ts` with ioredis) becomes
  Better Auth's secondary storage for sessions and rate limits, backs RPC limits and
  stores `runtime.cache` values.
  Sessions are still written to PostgreSQL; Workers never import Redis. Requires
  Redis 7+ or Valkey (`EXPIRE NX`, `GETDEL`).
  `tests/redis/` runs with `test:redis` and `TEST_REDIS_URL`.
- `/ready` probes PostgreSQL (and Redis when configured) within three seconds and
  returns per-dependency `ok`/`unavailable` without error details; `/health` stays
  liveness-only. RPC rejects `__proto__`/`constructor.prototype` input keys (`INVALID_INPUT`,
  oRPC beta.44 dropped its plugin) and runs a 15 s
  `TimeoutHandlerPlugin`; a middleware answers `SERVICE_UNAVAILABLE`/`REQUEST_TIMEOUT`
  because database calls do not observe the abort signal.
- Request IDs are `req_` plus 24 letters so log redaction never masks them. With
  `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST`, error-level and 5xx events also go to
  PostHog error tracking after the field policy, best effort (`server/error-reports.ts`).
- `secureHeaders` sends a deny-all CSP, `X-Frame-Options: DENY` and HSTS. Keep
  Cross-Origin-Resource-Policy off; CORS remains the cross-origin access control.
- Production requires explicit DATABASE_URL, AUTH_URL, AUTH_SECRET and ALLOWED_ORIGINS.
- Use HTTPS and secure cookies in production, exact trusted origins only.
- Close Node's PostgreSQL pool idempotently through Nitro's close hook. Worker requests
  close their own client and flush the shared logger without closing it for other requests.
- No old business endpoints, worker, local execution endpoints or second server.
- Unconfigured mail actions return MAIL_NOT_CONFIGURED before Better Auth dispatch;
  startup, liveness and existing sign-in remain available.
- Never import another app. Local CLI execution stays outside the HTTP API.
- Runtime configures `@raypx/logger` (evlog) once through `server/logging.ts`; typed application events pass `logging/policy.ts` and the shared bounded managed drain, flushed on Nitro shutdown.
  PostHog has separate 16-event/four-request bounds, two-second deadlines and loss statistics.
  Managed close bounds waiting to ten seconds. Log cleanup context counts as `contextReceipts` (command names are sensitive).
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
TEST_DATABASE_URL=postgres://user:password@localhost/raypx_foundation_test bun run test:postgres:cloudflare
```

## Remote tasks

`server/control` owns device credentials and account-scoped read projections.
`server/relay` authenticates and routes typed WebSocket messages; execution and
first-answer decisions belong to CLI. HTTP RPC exposes reads, device management
and one-time viewer tickets. No HTTP task mutation or polling exchange remains.
Node uses one relay process; Cloudflare uses an account-named Durable Object with
connections fenced by identity. Keep credentials out of URLs and diagnostics.
Relay v2 requires an explicit protocol version. Preserve full activity checkpoints
and bounded incremental replay; a missing revision requests a snapshot. Keep the latest
activity projection until explicit history removal. Missing entries in partial snapshots
never authorize deleting conversation history. Read projections through the repository's
read-only transaction without the owner write lock; constrain task history in SQL.
Task pagination and pending-approval filtering/limits also belong in SQL. Normalize
JSON strings at the repository boundary, including old malformed surrogate/NUL input.
Internal storage failures close relay with SERVER_UNAVAILABLE/1011; malformed frames
remain INVALID_FRAME. Persist the latest activity projection, not raw delta replay
rows. Delta-only batches do not prune the replay window; gaps trigger authoritative
reset. Materialize the window once before deletion, even with stale device statistics.

## Administrator configuration

`server/configuration/` owns the typed non-secret site settings and PostgreSQL repository.
`types.ts` defines the reader, service and repository ports. Inject `ConfigurationReader`
into read-only consumers; `createRuntime` exposes `configuration` and accepts a
`createConfigurationRepository(db)` factory scoped to its owned connection.
Node/Worker constructors accept these typed providers as a second argument.
`runtime.readSession(headers)` resolves through the same auth adapter as HTTP on
each call; consumers must not retain that session between requests. Direct
service writes require a freshly resolved administrator session and expected revision,
just like HTTP writes. Never put the service in a global Worker container.
`configuration.get/update` require a fresh verified session in `ADMIN_EMAILS`; writes
also require a trusted Origin. Public projection exposes only site name and signup
availability. Save with an expected revision; never overwrite concurrent edits.
Registration is enforced by the Better Auth user-create hook with a fresh read, so
it covers every sign-in method; the email signup route only pre-checks the 5-second
`readCached()` snapshot. Use `readCached()` only where that delay is acceptable.
Optional `S3_*` variables (all of endpoint, bucket and keys, or none) give `runtime.storage`
an S3-compatible `@raypx/storage` store on Node and Workers alike; otherwise it is the
unavailable storage whose operations fail with `STORAGE_NOT_CONFIGURED`. `RuntimeProviders.storage`
overrides it. No route exposes storage yet; consumers must validate ownership before
issuing keys or pre-signed URLs. See `docs/development/object-storage.md`.
`server/cache/` owns the runtime cache (`runtime.cache`, `RuntimeProviders.cache`):
Redis behind a one-second process-local copy when configured, else memory per process
or Worker isolate. Values are JSON
parsed by the caller's schema; store failures become misses. Cache only data that
has a loader, and keep authoritative checks on the source. See `docs/development/caching.md`.
Run the migration before deploying: signup fails closed without the table. Jobs combine the
stored cleanup switch with deployment `JOBS_ENABLED`; disabled deployments do not
query configuration on schedule. No secrets or arbitrary env keys enter the API.
See `docs/development/configuration.md`.

## Independent host and terminal projections

Host bootstrap requires the current account session and a device/epoch binding.
Only hashed, expiring, device-scoped credentials are stored. They renew device grants
without retaining browser sessions; revoke invalidates all credentials for that device.
Never accept a host credential as a viewer ticket. Relay v3 stores observed requests
separately from managed tasks, validates connection/epoch/revision and ACKs only after
commit. Summary reads omit bodies/questions/answers; fetch one body only on expansion.
Private local host/router methods are never public HTTP methods. Terminal content is
explicitly plain private testing data; E2EE is a later public-release gate.

Host bootstrap requires a session created within ten minutes and after the last
security revocation. Replace the prior device key atomically under the account
write lock. Validate password fingerprint and `control_owner.security_epoch` on
host grants/relay access. Legacy credentials without a bootstrap session must
reauthorize; they cannot issue grants or retain relay access. Successful bulk auth
revocation advances the epoch; a successful single-session revocation targets only
its credentials. Ordinary expiry is independent. Device revocation deletes its
observed sessions/requests transactionally, preserving managed history. Background
cleanup drains old revoked-device projections in batches of 1000 per table. Server cancellation
uses a projection marker and never increments host-owned request revisions.
