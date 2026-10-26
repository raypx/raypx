# @raypx/database

## Purpose

PostgreSQL persistence for the new account foundation.

## Interface

`.`: connectDatabase and migrateDatabase. `/connection`: runtime connection/types without migration imports.
`/schema`: the Better Auth tables (including the shared `rate_limit` store), control records and relations. `/env`: validated database configuration.

## Ownership

PostgreSQL persistence for the new account foundation.

## Constraints

Use postgres.js and Drizzle. Active tables are in raypx_foundation; migration history uses raypx_foundation_migrations. drizzle and drizzle-cloud are historical archives and must never be applied to the new database. No reset/drop command. Generate new migrations with drizzle-kit; never edit generated SQL or snapshots. No runtime dependency on auth, tooling or apps.
`studio` (root `db:studio`) opens Drizzle Studio with write access; only point it at the local foundation database.
Node defaults to a process pool of ten connections. Workers use `/connection` with
request-owned clients, bounded connection counts and no type-fetch round trip.
Keep filesystem-based migrations in `migrate.ts` and outside Worker runtime imports.
Session and verification expiry indexes support API maintenance batches; retention
and scheduling policy belongs to the API, not this persistence package.

## Verification

```sh
bun run --cwd packages/database check
bun run --cwd packages/database test
DATABASE_URL=postgres://localhost/raypx_foundation_test bun run --cwd packages/database generate
```

Remote control records share the foundation schema and cascade with the account.
`control_owner` provides a transactional cross-instance account write lock; read-only projections do not acquire it; payloads are
explicit domain projections. Changes require generated foundation migrations.

`system_configuration` stores the singleton non-secret site settings with revision
and last-editor metadata. API owns validation, permissions and compare-and-swap.

`control_credential` stores only restricted host credential hashes/expiry; API owns
issuance and revocation. `control_observed_session` and `control_observed_request`
store bounded observed projections separately from managed tasks. Their migrations
are generated with the foundation schema and never applied to a retired database.

`control_owner.security_epoch/security_revoked_at` fence host credentials and stale
bootstrap cookies during security revocation. Auth/API own their transition policy.

`cloud_job` stores account-owned plans with CAS revisions and captured device epochs.
Its UUID is the create request ID. `cloud_job_run` snapshots each immutable action;
its primary key is also the managed task/command ID, with a separate unique scheduled
occurrence index. Internal checked-at timestamps support fair active reconciliation
and are absent from public DTOs. API owns claiming, overlap and uncertainty policy.
Deleting a plan cascades its run log only; managed control tasks are separate.

`context_document` stores current account-owned memory/templates; `context_version`
stores complete immutable revisions. API owns CAS, quota, idempotency and restore
policy. Read resolution joins current eligibility with selected revisions in one
MVCC snapshot without the account write lock. Archive never deletes either table.
The global `lower(id)` unique index enforces canonical document identity and supports
case-insensitive creation retries without scanning other owners' documents.

Partial context-command owner/window and expiry indexes cover only full context bodies;
compacted unknown-delivery receipts remain outside replay/body maintenance scans.

`context_deletion` stores body-free owner/revision receipts. API deletion removes the
source and cascades its versions atomically; the reserved canonical ID prevents reuse.
