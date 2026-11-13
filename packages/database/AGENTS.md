# @raypx/database

## Purpose

PostgreSQL persistence for the new account foundation.

## Interface

`.`: connectDatabase and migrateDatabase. `/connection`: runtime connection/types without migration imports.
`/schema`: the Better Auth tables (including the shared `rate_limit` store), control records and relations. `/env`: validated database configuration.

## Ownership

PostgreSQL persistence for the new account foundation.

## Constraints

Use postgres.js and Drizzle. Application tables and `public.__drizzle_migrations`
live in the dedicated Raypx database. Keep the `drizzle-foundation` history intact.
Generate new migrations with drizzle-kit. Never edit generated SQL or snapshots.
No reset/drop command or runtime dependency on auth, tooling or apps.
`studio` (root `db:studio`) opens Drizzle Studio with write access; only point it at the local foundation database.
Schema generation and Studio run through the private `@raypx/drizzle-kit` workspace.
Bun defaults to a process pool of ten connections. `/connection` keeps runtime
connections separate from filesystem-based migrations in `migrate.ts`.
API startup and explicit commands share the migrator's transaction-scoped advisory lock
before any ledger/schema access. Lock acquisition waits at most 120 seconds; subsequent
DDL lock waits are bounded to ten seconds. Migration, ledger and lock release commit or
roll back together. Keep the official Drizzle migrator inside that transaction.
The migrator moves the previous ledger into `public` before Drizzle reads it.
The API's `db:migrate` command can inject a provider import into the same
transaction after the schema applies. Database has no dependency on provider policy.
Session and verification expiry indexes support API maintenance batches; retention
and scheduling policy belongs to the API, not this persistence package.
Better Auth Admin uses `user.role/banned/ban_reason/ban_expires` and
`session.impersonated_by`. New/existing foundation users default to `member`;
operator bootstrap and role mutations belong to API/Auth. No role backfill touches
retired product tables.

## Verification

```sh
bun run --cwd packages/database check
bun run --cwd packages/database test
DATABASE_URL=postgres://localhost/raypx_foundation_test bun run --cwd packages/database generate
```

Remote control records share the public schema and cascade with the account.
`control_owner` provides a transactional cross-instance account write lock; read-only projections do not acquire it; payloads are
explicit domain projections. Changes require generated foundation migrations.

`system_configuration` stores the singleton non-secret site settings with revision
and last-editor metadata. API owns validation, permissions and compare-and-swap.

`storage_configuration` stores the S3 endpoint, bucket and encrypted credentials.
`mail_configuration` stores the revisioned Resend sender, locale, delivery switch and encrypted key.
`session_attachment` stores account- and project-scoped text projections with
publication and expiry metadata. API owns encryption, object writes and admission.

`control_credential` stores only restricted host credential hashes/expiry; API owns
issuance and revocation. `control_observed_session` and `control_observed_request`
store bounded observed projections separately from managed tasks. Their migrations
are generated with the Raypx schema and never applied to a retired database.

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

`runtime_instance` stores account/origin-bound public instance identities and revocation revisions. `instance_enrollment` stores ten-minute pending records with hashed approval codes and host tokens. API serializes ownership with instance advisory locks. These are registration records, separate from remote Host grants and local Agent persistence.

`admin_audit` stores durable administration intents and terminal outcomes, with
bounded non-secret change snapshots. Actor/target IDs deliberately have no cascading
foreign keys: historical evidence survives account deletion. API owns transaction
coupling, result classification, access control and long-term retention. Time and
identity indexes support cursor queries. `user.created_at` indexes registration trends.
