# api

Group procedures reuse fresh session/Space admission and trusted mutation
Origins. The runner exposes bounded Agent messaging and durable delegation tools;
runtime composes a PostgreSQL per-Agent Computer-use gate. `/events` tracks
concurrent live prefixes/deltas independently by Run while retaining one ordered
conversation cursor. These capabilities add no environment variables.

## Purpose

The Bun HTTP composition root for authentication, account and administrator RPC,
remote read projections, memory and cloud scheduling. Feature workspaces own the
server implementations: Tasks/server owns task projections, Memory/server/postgres
owns account contexts, and Jobs/server/postgres owns cloud scheduling persistence.
API injects the owned database and authorization/transport ports.

## Interface

`computers.get/start/stop` uses `@raypx/computers/server` with fresh membership,
trusted mutation Origin and account quotas. Runtime injects no provider by default;
`COMPUTER_PROVIDER=docker` lazily loads the private supervisor HTTP adapter and
requires its independent URL/token. No Engine socket setting is accepted by API.
Explicit start or the first executed model tool creates the team computer.
Runtime composes Computer tools and approval/effect services with the runner.
`approvals.pending/answer/effects` require fresh Space membership; answers require
the addressed account. `approvals.settings/updateSettings` use the session account.
Mutations require trusted Origin and quotas. Account approval settings require an
expected revision for writes and return current settings on conflict; settings
reads expose Auto's REVIEW_MODEL_NOT_CONFIGURED availability reason.
APPROVAL_DEFAULT_MODE defaults to ask; APPROVAL_REQUEST_TTL_MS defaults to 600000.
Runtime construction performs no effect or recovery I/O. Effect reads and attempt
decisions persist unknown after the shared intent timeout, with a tracked tool's
single finish event in the same transaction; worker start owns recovery scans. Known deployment
secrets are rejected at Computer input/output.

`spaces.*` resolves the account from the current session and delegates first-use
private-Space bootstrap and discovery to `@raypx/spaces/server`. `agents.*`
resolves that account's member row for the selected Space on every request before
calling `@raypx/agents/server`. Missing membership and missing records both answer
NOT_FOUND, including for deployment administrators. Mutations require trusted
Origin and account limits. Agent creation and its direct Conversation commit together.
`spaceManagement` composes owner/member management, seven-day hashed invitations,
owner approval overrides/audit and member directory/events. Its required removal
hook cancels Runs/cards in the membership transaction; postcommit hooks abort local
execution. A dedicated Space fanout actively closes affected sockets. The worker
resumes claimed Space deletion in leased durable stages and starts only in worker
roles, outside construction. No membership UI or group/delegation is implemented.
`conversations.send/events/snapshot` reuse that scope boundary and delegate to the
Agents conversation repository. `/events` is a session-authenticated, Origin-checked
CrossWS route on the same listener in API-enabled roles. It multiplexes bounded
subscriptions, exact event ACKs and snapshot-required recovery; clients persist
and resubmit their last applied cursor. The stream rechecks sessions/membership
before delivery and on a one-second poll. Runtime owns the PostgreSQL fanout port,
LISTEN connection, timer and socket shutdown. API also composes ConversationRunner
and the deployment ModelAccess adapter using optional AGENT_MODELS and protected
AGENT_MODEL_CREDENTIALS JSON inputs. Empty configuration permits startup; missing
models fail Runs visibly without fallback. `conversations.stop` uses the same
membership/Origin/quota admission. `runtime/agents.ts` composes the same fenced runner for direct API dispatch and
worker recovery. Default `SERVER_ROLE=all` starts API, worker and Relay; `api`
starts work directly and `worker` scans lost starts/expired leases without Auth or
RPC. Backend start, separate from runtime construction, starts worker scans and
fanout subscriptions. Lease, heartbeat, scan interval, attempt timeout and backup
margin use the RUN_* environment inputs. Run model/connection/computer pins,
turn checkpoints, steering and keyed backup jobs stay in PostgreSQL. Live
prefixes/deltas stay in the executor; all API processes replay committed events.
Shutdown drains HTTP, releases leases and preserves approval requests for another
worker before closing storage. No provider text or credentials enter execution logs. `RuntimeProviders.createConversationFanout`
can inject the subscriber for offline runtime tests.
`modelConnections.list/create/update/delete/test` uses the session account only.
Secrets are write-only and envelope-encrypted with the configuration cipher and
APP_KEY key provider. API and recovery workers share APP_KEY; constructors do no I/O.
All-Space availability includes future Spaces; selected availability references
current owner memberships and cascades with them. Deleting a connection/account
cascades its secret. Run pins exclude credentials; rotation remains resumable.
Request-owned credential guards cover both model responses and Computer results.
`agents.models` lists opaque identifiers, display names and connection/deployment source after resolving Space
membership. Configured display names default to the opaque identifier; entries without
a configured credential are not offered. Provider details and credentials stay private.
The owning feature packages also have separate `test:postgres` modes.
`deployment:fixture:build --outfile <absolute-path>` bundles the test-only account
provisioner for `smoke:deployment` as one minified Bun ESM file, without embedding
environment values. Tooling mounts that file read-only into the prepared migration
image on the owned internal network; production API images never carry it.
At runtime it requires the explicit fixture flag, an owned
`raypx_deployment_*_test` database and an `example.invalid` account. Verification
mail stays in-process; never reuse this fixture against an operator database or
bypass real-user verification.

`/api/auth/*` delegates to Better Auth, including Google/GitHub OAuth and public
provider discovery. Desktop OAuth/OIDC uses the same handler, with issuer
metadata at the root `/.well-known/` endpoints. API injects optional paired `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
and `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`; neither secret reaches Web. `/rpc/*` serves the explicit oRPC account
contract. `/health` reports process liveness without querying PostgreSQL;
`/ready` checks configured dependencies. `/api/openapi.json` combines the Hono
health routes and the explicit read-only oRPC selection served under `/api/v1/*`.
`/api/docs` renders that document through oRPC's Swagger UI reference plugin.
Nitro serves the bundled Swagger assets from `/api/docs/assets/` on the same origin in API-enabled roles.
`src/routers/openapi.ts` uses the OpenAPI metadata in `@raypx/contracts/api` to
select the same procedures for HTTP dispatch and schema generation. Keep
credential issuance, writes and private transports on their
existing boundaries. Unmatched paths return a JSON 404; Web is a separate service.
Versioned HTTP routes use resource paths, `GET` for reads, path parameters for
resource IDs and query parameters for filters and pagination. Known resources
return `405` with `Allow` for unsupported methods.

Unit tests live beside source in `src/`; `tests/integration/` and these unit tests
form the default database-free gate. `tests/postgres/node/` uses the `postgres`
mode of `vitest.config.ts` for real-database tests. Shared fixtures stay in `tests/`.

## Ownership

Nitro owns the platform entry. `src/app/entry.ts` sets a 25-second HTTP shutdown
grace; signal admission stops runner claims before draining, and the close hook
hands over attempts afterwards. Hono owns the shared Fetch application.
The Nitro Fetch entry lives in `src/app/`; runtime composition and adapters
live in `src/runtime/`. Hono and oRPC middleware live in `src/middleware/`.
`src/routers/index.ts` applies shared HTTP middleware and mounts the auth,
health, OpenAPI and oRPC subrouters with `app.route()`.
`src/routers/relay/` owns Relay HTTP probes and the Hono WebSocket route.
Hono admits upgrades and supplies CrossWS hooks to Nitro's Bun listener.
`runtime/shared.ts` composes services from the injected database, logger and providers.
`runtime/control.ts` is the one Control/Memory/attachment composition for every role;
never assemble `ControlService` elsewhere. `runtime/database.ts` opens runtime pools with a
12-second `statement_timeout` (below the 15-second RPC deadline) and a 30-second
idle-transaction bound, so an abandoned request releases its connection. Migrations
use an unbounded connection.
`runtime/adapters.ts` picks session and rate-limit adapters and builds the auth config.
`runtime/lifecycle.ts` closes
owned resources in reverse order, every one even after a failure, and only once.
`runtime/server.ts` initializes one process runtime, closed by `runtime/plugin.ts` through Nitro's close hook.
Before allocating runtime resources it applies pending foundation migrations by default.
`db:migrate` is the explicit operator entry for schema and requested provider
imports. Imports run inside the Drizzle migration transaction. API startup
applies schema only. The explicit command can provision a restricted runtime login
inside the same transaction for isolated Compose deployments.
`DATABASE_MIGRATE_ON_START=false` skips only API startup migration. Nitro bundles private
SQL assets; startup stages them temporarily for the database package's Drizzle migrator
and removes the temporary directory on success or failure. Migration errors stop startup
with a safe message. Never log driver errors or expose migration assets over HTTP.
Account RPC uses `@raypx/account/server` with an injected session reader. The
service projects public fields; API owns HTTP and unauthorized/error mapping.

`jobs/` owns server maintenance; `jobs/runtime/` contains the Nitro Task entries.
`maintenance:cleanup` runs every 15 minutes on Bun, gated by
`JOBS_ENABLED` (false by default). Nitro owns the schedule.
Cleanup uses PostgreSQL transaction time, an advisory transaction lock and bounded
row-locked batches. Sessions/verification records expired over 24 hours ago,
rate limits older than one hour are eligible. Device revocation removes terminal projections immediately. Failure rolls back and retries
on the next schedule. Never add a production HTTP task runner or log driver errors.
Tasks reuse the API runtime.
See `docs/development/server-jobs.md` for policy and verification.

`schedules:tick` runs every minute on Bun with the same deployment gate.
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
`@raypx/memory/server/postgres` atomically stores current documents and immutable
versions. Resolve joins current eligibility with selected revisions without account
write locking. Sources are frozen on task creation and obey core's full prompt budget.
Context command replay bodies expire after 24 hours and are limited to 4096 rows/8 MiB
per account on acceptance. Bounded compaction retains unknown-delivery digest receipts;
only a matching authoritative task projection allows receipt deletion. Cleanup uses the
same compactor for expired bodies; partial indexes exclude already compacted receipts.

## Constraints

- Dev and build run vp under Bun (`bun --bun vp`); start `.output/server/index.mjs`
  with `bun`, built by the shared Nitro `bun` preset.
  Common target options come from `@raypx/tooling/build/nitro`; API owns routes and runtime plugins.
- Web owns product pages and assets. Optional AUTH_DOMAIN shares session cookies
  with a Web host on a sibling subdomain so its server rendering sees the session.
- Dockerfile is shared by Compose and Railway. Its default deploy stage carries
  the bundled Bun migration command and canonical SQL
  for pre-deploy migration.
  Compose selects the runtime and independent migrate targets explicitly.
  The runtime output also includes private SQL assets for default startup migration.
  Both migration-capable targets copy the shared migration payload. The synthetic
  deployment account provisioner is a separately prepared test bundle mounted only
  during acceptance; production targets do not build or carry that fixture.
- Resolve the Better Auth session on every account RPC; never accept actor IDs.
- Development counts RPC limits in process memory so limited paths run locally; tests
  stay unlimited unless they inject a limiter. Production rate limits share the `rate_limit` table: Better Auth limits auth routes
  by client IP. The Nitro entry overwrites `x-raypx-client-ip` with the socket address
  and uses it unless `AUTH_IP_HEADERS`/`AUTH_TRUSTED_PROXIES` describe a proxy. `src/rate-limit.ts` limits grant/ticket procedures per account (`RATE_LIMITED`).
  Keep RPC windows at or below 60 seconds, Better Auth's pruning horizon. Host grants
  have pre-lookup limits by platform-owned client address (120/min) and credential
  digest (6/min); never use a caller-selected forwarding header or raw bearer key.
  Host revocation shares the address limit. Unauthenticated instance polls and checks
  are limited by address (300/min) before the per-ID window, since callers choose the ID.
- Optional `REDIS_URL` (Bun runtime, `src/runtime/redis.ts` with ioredis) becomes
  Better Auth's secondary storage for sessions and rate limits, backs RPC limits and
  broadcasts configuration changes.
  Sessions are still written to PostgreSQL. Requires
  Redis 7+ or Valkey (`EXPIRE NX`, `GETDEL`).
  `tests/redis/` runs with `test:redis` and `TEST_REDIS_URL`.
- `/ready` and authorized administrator health share one in-flight probe per
  dependency per runtime. PostgreSQL and Redis results are reused for one second.
  Relay state is read on demand. A three-second deadline returns `unavailable`
  without driver details or starting another probe while the driver is pending.
  `/ready` is `no-store` and `/health` stays liveness-only.
  RPC rejects `__proto__`/`constructor.prototype` input keys (`INVALID_INPUT`,
  oRPC beta.44 dropped its plugin) and runs a 15 s
  `TimeoutHandlerPlugin`; a middleware answers `SERVICE_UNAVAILABLE`/`REQUEST_TIMEOUT`
  because database calls do not observe the abort signal.
- Request IDs are `req_` plus 24 letters so log redaction never masks them. With
  `POSTHOG_PROJECT_TOKEN` and `POSTHOG_HOST`, error-level and 5xx events also go to
  PostHog error tracking after the field policy, best effort (`src/error-reports.ts`).
- API responses use a deny-all CSP. `/api/docs` allows same-origin assets and
  connections, with a per-response nonce for its bootstrap script.
  `secureHeaders` sends `X-Frame-Options: DENY` and HSTS. Keep
  Cross-Origin-Resource-Policy off; CORS remains the cross-origin access control.
- Production API-enabled roles require explicit DATABASE_URL, AUTH_URL, AUTH_SECRET, APP_KEY and ALLOWED_ORIGINS.
  `AUTH_SECRET` belongs to Better Auth only. `APP_KEY` encrypts stored provider credentials
  and seeds instance signing, and must differ so rotating sessions invalidates neither.
  `src/env.contract.ts` is the static deployment input catalog. The runtime schema
  must declare exactly its keys; tooling reads this data without importing API runtime.
- Use HTTPS and secure cookies in production, exact trusted origins only.
- Close the PostgreSQL pool idempotently through Nitro's close hook.
- No local execution endpoints. Each role uses the one Nitro listener. Worker exposes
  health/readiness only. Hono admits `/events` in API/all and `/relay` in all/relay.
- Unconfigured mail actions return MAIL_NOT_CONFIGURED before Better Auth dispatch;
  startup, liveness and existing sign-in remain available.
- Auth preflight errors negotiate `Accept-Language` with Hono and mark the response
  with `Content-Language`. Better Auth receives the original request for mail negotiation.
- Never import another app. Local CLI execution stays outside the HTTP API.
- Runtime configures `@raypx/logger` (evlog) once through `src/logging.ts`; typed application events pass `logging/policy.ts` and the shared bounded managed drain, flushed on Nitro shutdown.
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
TEST_DATABASE_URL=postgres://localhost/raypx_foundation_test bun run --cwd apps/api test:postgres
```

## Remote tasks

`@raypx/control` owns shared device credentials, command routing and account-scoped
read projections. `/postgres` provides the control/context adapters. Account
mutations take an exclusive owner lock; device projection transactions take a
shared security fence and device advisory lock. Read-only reads take neither lock.
HTTP RPC exposes reads, device management and one-time viewer tickets. Hono routes
Relay v5 WebSockets in the `all` (default) and `relay` roles. One build supports
all roles. Combined scheduling/revocation calls RelayHub directly; configured Redis
attaches cluster routing and shared caches. A broker that does not attach at startup
keeps reconnecting; API-enabled roles log `relay.cluster` and `/ready` reports the relay. Retained split device routing requires optional Redis; Durable Run API/worker
coordination uses PostgreSQL only. The relay role parses only DB, optional broker and origins, never constructs Auth, cookies,
mail or signer, and skips scheduled jobs and migration. `runtime/backend.ts` owns
process selection/lifecycle; `runtime/server.ts` composes API-enabled roles.
PostgreSQL owns connection identity. Never retry uncertain delivery
or put credentials on the bus. `test:cluster` uses owned PostgreSQL/Redis and
includes cross-process Relay dispatch, revocation and independent lifecycle checks.
Relay v5 requires an explicit protocol version. Preserve full activity checkpoints
and bounded incremental replay; a missing revision requests a snapshot. Keep the latest
activity projection until explicit history removal. Missing entries in partial snapshots
never authorize deleting conversation history. Read projections through the repository's
read-only transaction without the owner write lock; constrain task history in SQL.
Task pagination and pending-approval filtering/limits also belong in SQL. Normalize
JSON strings at the repository boundary, including malformed surrogate/NUL input.
Internal storage failures close relay with SERVER_UNAVAILABLE/1011; malformed frames
remain INVALID_FRAME. Persist the latest activity projection, not raw delta replay
rows. Delta-only batches do not prune the replay window; gaps trigger authoritative
reset. Materialize the window once before deletion, even with stale device statistics.

## Administrator configuration

`src/config/` owns the typed non-secret site settings and PostgreSQL repository.
`types.ts` defines the reader, service and repository ports. Inject `ConfigReader`
into read-only consumers; `createRuntime` exposes `config` and accepts a
`createConfigRepository(db, audit)` factory scoped to its owned connection.
The runtime constructor accepts these typed providers as a second argument.
`runtime.readSession(headers)` resolves through the same auth adapter as HTTP on
each call; consumers must not retain that session between requests. Direct
service writes require a freshly resolved administrator session and expected revision,
just like HTTP writes. Keep the service in its owned runtime.
`src/access.ts` projects Better Auth's persisted roles from fresh verified sessions,
using its shared ACL through `@raypx/account/access`. `account.access`
projects these grants; menu visibility never authorizes an API request. Remote HTTP
reads/writes check their feature permission and retain account/device ownership checks.
`ADMIN_EMAILS` is used only by the explicit `auth:bootstrap-admins` operator command
for existing verified accounts. It never overrides a later role change. Runtime's
server-only `auth` instance supports that command; no auth implementation enters Web.
`configuration.get/update` require configuration permissions; writes
also require a trusted Origin. Public projection exposes only site name and signup
availability. Save with an expected revision; never overwrite concurrent edits.
Registration is enforced by the Better Auth user-create hook with a fresh read, so
it covers every sign-in method; the email signup route only pre-checks the 5-second
`readCached()` snapshot. Use `readCached()` only where that delay is acceptable.
`configuration.storage/updateStorage` manage revisioned S3 settings with the same
permission and audit gates. Reads exclude credentials. The `db:migrate --storage-stdin`
operator command also supports custom S3 endpoints. PostgreSQL stores credentials
encrypted with the API's `APP_KEY`. `attachments.upload` verifies the account, origin
and project before storing an original in the private bucket. The split relay
reads bounded text projections from PostgreSQL. `RuntimeProviders.storage`
overrides the provider for tests. See `docs/development/object-storage.md`.
`configuration.resend/updateResend` use the same authorization and audit gates.
Site, S3 and Resend use `src/config/reads.ts` for typed fresh and cached reads.
S3 and Resend writes go through `src/config/audited-write.ts`, the one path that
commits a change with its audit success and then invalidates readers.
Each save clears its scope after commit and publishes its revision over Redis.
A five-second TTL covers missed notifications. Keep administrator reads,
registration admission and S3 uploads on the authoritative path.
The Resend API key is write-only and encrypted with the
`APP_KEY`. `db:migrate --import-config` seeds a missing row
explicitly before the first administrator signup or when upgrading.
See `docs/development/caching.md` for the configuration reader.
Run the migration before deploying: signup fails closed without the table. Jobs combine the
stored cleanup switch with deployment `JOBS_ENABLED`; disabled deployments do not
query configuration on schedule. API responses exclude secrets and arbitrary env keys.
See `docs/development/configuration.md`.

## Independent host and terminal projections

Host bootstrap requires the current account session and a device/epoch binding.
Only hashed, expiring, device-scoped credentials are stored. They renew device grants
without retaining browser sessions; revoke invalidates all credentials for that device.
Never accept a host credential as a viewer ticket. Relay v5 stores observed requests
separately from managed tasks, validates connection/epoch/revision and ACKs only after
commit. Summary reads omit bodies/questions/answers; fetch one body only on expansion.
Private local host/router methods are never public HTTP methods. Terminal content is
explicitly plain private testing data; E2EE is a later public-release gate.

Host bootstrap requires a session created within ten minutes and after the last
security revocation. Replace the prior device key atomically under the account
write lock. Validate password fingerprint and `control_owner.security_epoch` on
host grants/relay access. Credentials require a bootstrap session; missing attribution
requires reauthorization and cannot issue grants or retain relay access. Successful bulk auth
revocation advances the epoch; a successful single-session revocation targets only
its credentials. Ordinary expiry is independent. Device revocation deletes its
observed sessions/requests transactionally, preserving managed history. Background
cleanup drains old revoked-device projections in batches of 1000 per table. Server cancellation
uses a projection marker and never increments host-owned request revisions.

`src/routers/rpc/` contains feature handlers and their service error mapping.
`setup.ts` wires shared oRPC middleware and adapts Control calls for multiple routers.
Every procedure declares its access in `@raypx/contracts/api` (`public`, `session`
or a permission) and its handler uses `withPublicRpcAccess` or `withRpcPermission`;
a test rejects a served procedure without one. Handlers never resolve sessions or
name permissions themselves. Each handler declares its quota alongside the
procedure; the account key is the contract path. Use `limitAccount` when the quota
must follow the trusted Origin check.
`src/app/options.ts` owns composition options; every service is required, so handlers
have no absent-service branch. Tests build partial applications through
`tests/helpers/app.ts`, whose missing services throw at first use. RPC handlers
never import the HTTP application entry. Runtime composes project validation
before Memory and control commands.

## Administration

`src/admin` owns overview queries, cursor-based audit history, request
scopes and the audited Better Auth adapter. Runtime injects one AuditService into
HTTP, the Auth adapter and configuration persistence. Audited mutations must write
a durable intent first and commit success alongside their business change in the
same PostgreSQL transaction. Failed finalization leaves visible uncertainty;
post-commit failures cannot rewrite success. Preserve authenticated actor scopes
across concurrent requests and direct-service/operator calls. Custom configuration
repository factories receive AuditService and must keep this atomic contract.
Audited requests are recorded for an admitted, identified caller, including
refusals, behind an admission quota on the runtime's shared rate limiter. A contract
procedure declares `rpcAudit(action)`; the first shared oRPC middleware opens the
record before input validation and resolves the request's session once for the audit
and access checks. The Hono boundary audits only Better Auth's role route through
`hono-rate-limiter`. Never match RPC paths there. The access middleware rejects a missing
declaration. Configuration mutations check the
account permission, quota and trusted Origin in that order.
Dependency checks reuse `/ready` probes;
statistics and audit expose no task content, addresses, secrets or raw HTTP bodies.
Audit records survive account deletion and are never removed by cleanup jobs.

- Authentication deployment accepts the passkey RP ID, a compromised-password check and paired Turnstile keys for email-code sends.

Existing explicit SERVER_ROLE=both remains a combined API/worker/Relay process;
all is the default for new configurations. No role requires Redis for Durable Runs.

Phase 4 composes `@raypx/jobs/routines` and `@raypx/memory/space-server` beside
retained account/device services. Routine ingress mounts `/routines` with bearer,
relay or HMAC admission independent of account sessions. Only explicit worker
start scans schedules; shutdown stops scans and drains before runner/storage.
Email requires paired `ROUTINE_EMAIL_RELAY_TOKEN` and `ROUTINE_EMAIL_DOMAIN`;
the token is dedicated and never reaches a worker. Memory tools share the existing
approval/effect pipeline and secret guards, with stale execution fences propagated.

Phase 5 composes Pages, skills and remote HTTP servers for both API and worker Runs.
`/page-content/public/:token` never resolves a session; `/page-content/member/:spaceId/:pageId`
resolves it freshly. Both preserve their sandbox CSP rather than API's deny-frame
policy, set no cookies and use no-store. Public limits use token/address digests.
Only model/remote adapters open secret-store envelopes. Remote credential guards
cover tool metadata, arguments and results before checkpoints/effects/events.
