# Server jobs

The API owns server-side jobs under `apps/api/server/jobs/`. Nitro Tasks supplies
the named task registry and platform scheduling. `maintenance:cleanup` runs on
`*/15 * * * *` (every 15 minutes) through the Node handler. This is independent of device-local CLI schedules and
Agent execution.

## Account cloud automations

`@raypx/jobs` owns the shared local/cloud job models, pure Cron calendar rules,
injected cloud use cases and shared browser views. Contracts composes those same
schemas into local IPC and account RPC. API owns PostgreSQL and relay adapters;
CLI owns device-local timers and execution. This keeps one schedule model without
making HTTP or the browser an execution host.

Web `/automations` manages account-owned cloud schedules. Desktop's automation
page separates **This computer** from **Cloud**. Local schedules remain available
without login and survive account changes; cloud reads and writes require login.
Scheduling does not install or enable a device host automatically.

The first cloud actions are:

| Action        | Behavior                                                                                                                                                   |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `device.sync` | Request a fresh, correlated device snapshot and finish only after it commits to the remote projection. Unrelated local tasks/files are not included.       |
| `agent.run`   | Create a task in an authorized device project, preserving normal Claude/Codex approvals and project locks. A delivery receipt is not execution completion. |

Each plan captures the selected device epoch. Revocation or an epoch change
requires the user to choose its current connection explicitly. Every execution
rechecks account ownership, epoch, connection, project and provider availability.
The backend never stores a browser cookie or runs a local shell action.

`schedules:tick` runs every minute on Node, controlled by
`JOBS_ENABLED` independently of the administrator's maintenance-cleanup switch.
The existing fifteen-minute cleanup task keeps its own policy. When scheduling is
disabled, tick performs no business queries; plans can still be saved and edited.
Apply the generated job/run migrations before deploying the new API.

PostgreSQL owns occurrence time, row claims, schedule revisions, history and a
unique scheduled occurrence key. A tick claims up to 25 occurrences and dispatches
at most five concurrently; active runs are reconciled in bounded, rotating batches.
Occurrences missed by more than one minute are recorded as skipped and advanced
to the next future time. There is no catch-up inference. Offline devices and active
prior runs produce explicit skipped records.

Schedule creation uses a client UUID as the plan ID. A retry with the same content
returns the saved plan; changed content under that ID conflicts. Manual runs also
retain their request UUID. For Agent actions, the run, task and command IDs match,
so the host can reuse durable command receipts instead of starting new reasoning.

Agent runs remain active while their task is pending, running, waiting or cancelling.
Each tick reconciles the authoritative task projection before claiming more work.
An expired/lost acknowledgement or a generic host error after sending is **unknown**,
not proof that execution never started. The plan is paused and that occurrence is
never resent. A process restart first checks the persisted task ID; a dispatch still
unconfirmed after two minutes becomes unknown. A completed projection can resolve
the run later, but does not automatically re-enable the paused plan.

Projection sync requires the host's optional `syncSupported` capability and a
matching `syncId`. Older hosts return `UPGRADE_REQUIRED`. New sync requests are
queued during an in-progress flush without disconnecting active commands.

Cloud mutations require a trusted Origin, a current account session and rate limits;
updates/deletion use revision checks. Deleting a plan removes its execution records
and stops future occurrences, while already-created Agent tasks remain in task
history. The browser uses explicit links to inspect those tasks and preserves
creation/run IDs across uncertain HTTP responses. Only visible, idle cloud views
refresh their private lists; account/client changes discard that view's state.

## Enable cleanup

1. Apply the foundation database migrations using the normal deployment procedure.
   The new migration adds expiry indexes to sessions and verification records.
2. Set `JOBS_ENABLED=true` in the API's runtime environment. It defaults to `false`,
   including development and artifact probes; disabled runs make no cleanup queries.
3. Keep **Background cleanup** enabled in [administrator settings](configuration.md).
   This persisted switch defaults to on and is read again before each enabled run.
4. Build and deploy the API for the selected platform.

Node's Nitro server runs the schedule while the API process is alive, using
`scheduledTasks` in `apps/api/vite.app.config.ts`.

## Cleanup policy

Only the following `raypx_foundation` records are eligible:

| Records                | Eligibility                         | Maximum per invocation |
| ---------------------- | ----------------------------------- | ---------------------- |
| Sessions               | Expired more than 24 hours ago      | 1,000                  |
| Verification tokens    | Expired more than 24 hours ago      | 1,000                  |
| Rate limits            | Last request more than one hour ago | 1,000                  |
| Terminal requests      | Device has been revoked             | 1,000                  |
| Terminal sessions      | Device has been revoked             | 1,000                  |
| Context command bodies | Accepted at least 24 hours ago      | 1,000 compacted        |

All comparisons use PostgreSQL time. The grace periods preserve recently expired
records and exceed the shared maximum 60-second rate-limit window. Users, accounts,
devices, managed Agent tasks, replay history and local profiles have no cleanup policy here. Device revocation now deletes its terminal projections immediately; this job drains records retained by older versions. It preserves projections for active devices. Old-data cleanup requires both enablement switches above, while new revocations do not depend on the schedule.

Context command cleanup removes private request/reference bodies while retaining
compact digest receipts for unknown delivery. Matching authoritative task
projections release duplicate commands immediately. New contextual commands also
enforce the per-account 4,096-body / 8 MiB replay window independently of cleanup
switches. See [task context](task-context.md) for recovery and retention semantics.

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

Node tasks reuse the API's process-owned database pool.

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
NODE_ENV=test TEST_DATABASE_URL=postgres://user:password@localhost/raypx_jobs_test bun run test postgres
bun run verify
```

PostgreSQL tests require an isolated database whose name ends in `_test`. They
cover expiry boundaries, repeat runs, transaction locking, rollback and batch
limits. The default unit gate requires no database.

## Adding a task

Keep business logic in `server/jobs/`, with thin platform entry modules in
`server/jobs/runtime/`. Register the handler by absolute path in the API's Nitro
configuration and its `scheduledTasks` registry. Specify
the job's idempotency, concurrency and retry policy before enabling it; cleanup's
transaction lock is specific to this task. Use separate locks for unrelated jobs.

Nitro Tasks is experimental in the pinned Nitro version. The Node deployment build
and scheduled-event tests are required when upgrading it. See
[Nitro Tasks](https://nitro.build/guide/tasks).
