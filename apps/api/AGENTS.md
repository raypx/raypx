# @voidmix/api

## Purpose

The standalone Nitro API application and the only HTTP composition root.

## Interface

```text
server/
  api/                 Hono, oRPC, auth, module composition, and API env
    router-context.ts  authenticated inputs, optional-field omission, pagination
    canonical-errors.ts centralized transport error conversion
    canonical-router.ts explicit canonical route composition
    *-handlers.ts domain handlers preserving the public contract tree
  app.ts               Nitro entry delegating to the API runtime
  env.ts               host-specific environment composition (AUTH_URL 3002)
  runtime.ts           memoized runtime and close boundary
  runtime.plugin.ts    startup validation and shutdown hook
```

## Ownership

- Own port 3002, the standalone Node artifact, Docker/Railway compatibility,
  and host lifecycle wiring.
- Own the HTTP host lifecycle and API composition. Domain commands stay in
  `@voidmix/application` and `@voidmix/core`; persistence stays in `@voidmix/db`.

## Constraints

- Never import Web, Desktop, Worker, or renderer code.
- Identity, Projects, Assets, Reviews and Activity services are required. Compose
  each service with its own ports. Cloud runtime composes the new repository,
  admission guard and object storage; direct tests may omit them explicitly.
- Library aggregation and activity pagination belong in Application/DB, never
  a per-project loop or missing-module fallback in an HTTP handler.
- Initialize exactly one runtime per process and close it idempotently through
  Nitro's `close` hook.
- Keep the standalone `AUTH_URL` default at `http://localhost:3002`; production
  must provide its public URL explicitly.
- Preserve `/api/auth/*`, `/rpc/*`, and `/health` as stable public endpoints.
- Nitro's explicit route map must also forward `/internal/execution/*` and
  `/api/cloud/storage/*` to Hono; development routing alone cannot verify them.
- Runtime Auth/Mail read settings repositories directly. The retired settings
  administration module and cache-invalidation callback are not part of V2.
- Configure the process logger once with service `api`; request logging is
  configured by the shared runtime.
- Keep all Nitro host wiring under `server/`; `src/` is not a runtime source tree.
- `cloud.*` procedures own conversations, tasks, runs, files, usage, preferences
  and notifications. Resolve the actor from the session on every operation.
- `/internal/execution/*` is a separate private contract authenticated by a
  durable hashed RunGrant, current owner epoch, live lease and current permission.
  It owns model/search credentials, dispatch and trusted late usage reconciliation.
  Runner inputs cannot supply identity, scope or fencing. Object transfers verify
  actual bytes and restrict keys to authorized inputs and outputs.
- Run/conversation SSE uses a dedicated handler without batching or the ordinary
  15-second deadline. Revalidate the original login session in every polling
  round; revocation, expiry or changed identity terminates the connection.
  Disconnecting does not cancel execution.
- Production requires private S3 storage and positive AI quotas. Expensive
  admissions fail closed when the Redis limiter is unavailable. Filesystem
  signed transfers are development/test only.
- Auth sessions, revocation, verification and policy remain PostgreSQL-backed;
  Redis is never injected into Better Auth. An initial Redis connection failure
  leaves history available and new production AI requests unavailable until
  the API restarts after Redis recovery.
- Sentry receives allowlisted metadata; request bodies, source content and
  signed object URLs never enter telemetry. See
  [cloud platform](../../docs/architecture/cloud-platform.md).

## Verification

```bash
bun run --cwd apps/api check
bun run --cwd apps/api test
bun run build:api
```
