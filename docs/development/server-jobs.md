# Server jobs

The API owns server-side jobs under `apps/api/server/jobs/`. Nitro Tasks supplies
the named task registry and platform scheduling. `maintenance:cleanup` runs on
`*/15 * * * *` (every 15 minutes). Its Node and Cloudflare handlers call the same
cleanup implementation. This is independent of device-local CLI schedules and
Agent execution.

## Enable cleanup

1. Apply the foundation database migrations using the normal deployment procedure.
   The new migration adds expiry indexes to sessions and verification records.
2. Set `JOBS_ENABLED=true` in the API's runtime environment. It defaults to `false`,
   including development and artifact probes; disabled runs make no cleanup queries.
3. Keep **Background cleanup** enabled in [administrator settings](configuration.md).
   This persisted switch defaults to on and is read again before each enabled run.
4. Build and deploy the API for the selected platform.

Node's Nitro server runs the schedule while the API process is alive. Cloudflare
invokes its `scheduled` handler through the Cron Trigger in `apps/api/wrangler.jsonc`.
Keep that expression aligned with `scheduledTasks` in `apps/api/vite.config.ts`.
This repository disables Nitro's generated deployment configuration, so Wrangler's
checked-in trigger configuration is required. Cloudflare uses UTC. The current
every-15-minute expression does not depend on the Node host's time zone.

## Cleanup policy

Only the following `raypx_foundation` records are eligible:

| Records             | Eligibility                         | Maximum per invocation |
| ------------------- | ----------------------------------- | ---------------------- |
| Sessions            | Expired more than 24 hours ago      | 1,000                  |
| Verification tokens | Expired more than 24 hours ago      | 1,000                  |
| Rate limits         | Last request more than one hour ago | 1,000                  |

All comparisons use PostgreSQL time. The grace periods preserve recently expired
records and exceed the shared maximum 60-second rate-limit window. Users, accounts,
devices, Agent tasks, replay history and local profiles have no cleanup policy here.

One transaction owns a PostgreSQL advisory lock across API instances and platforms.
Another concurrent invocation returns `skipped`. Candidate rows use `FOR UPDATE
SKIP LOCKED`, and eligibility is checked again during deletion. Each statement has
a five-second timeout and a one-second lock timeout. Any failure rolls back the
whole batch; remaining records are eligible on the next scheduled invocation.

This maintenance task is idempotent. It has no durable queue, per-run database
history or immediate retry loop. A failed or missed invocation is retried by the
next scheduled run; a backlog drains in bounded batches. Logs include operation,
status and deletion counts, with driver errors reduced to `JOB_FAILED`. They never
include row identifiers, tokens, query parameters or connection strings.

Node uses the API's process-owned pool. Each Worker scheduled event reads its own
bindings, prefers Hyperdrive when configured, and closes its runtime before the
event completes. Keep Hyperdrive caching disabled as required for authentication.

## Development and verification

With the API development server running and an intended development database,
Nitro's development-only task endpoint can invoke the job:

```sh
curl -X POST http://localhost:3002/_nitro/tasks/maintenance:cleanup
```

`JOBS_ENABLED` still applies. The built production API exposes no HTTP task runner;
`/_nitro/tasks/maintenance:cleanup` returns 404.

```sh
bun run --cwd apps/api test -- tests/unit/jobs
NODE_ENV=test TEST_DATABASE_URL=postgres://user:password@localhost/raypx_jobs_test bun run test:postgres
bun run build:api:cloudflare
NODE_ENV=test TEST_DATABASE_URL=postgres://user:password@localhost/raypx_jobs_test bun run test:postgres:cloudflare
bun run verify
```

PostgreSQL tests require an isolated database whose name ends in `_test`. They
cover expiry boundaries, repeat runs, transaction locking, rollback and batch
limits. Worker tests dispatch real scheduled events to the built artifact under
workerd with both direct PostgreSQL and local Hyperdrive connections. The default
artifact gate also invokes the disabled scheduled task without a database.

## Adding a task

Keep business logic in `server/jobs/`, with thin platform entry modules in
`server/jobs/runtime/`. Register the handler by absolute path in the API's Nitro
configuration, and add a matching Wrangler Cron Trigger when scheduled. Specify
the job's idempotency, concurrency and retry policy before enabling it; cleanup's
transaction lock is specific to this task. Use separate locks for unrelated jobs.

Nitro Tasks is experimental in the pinned Nitro version. Both deployment builds
and the scheduled-event tests are required when upgrading it. See
[Nitro Tasks](https://nitro.build/guide/tasks) and
[Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/).
