# @raypx/database

Groups retain participant and message-mention relations with composite Space
foreign keys. Agent tombstones preserve group attribution after deletion. Child
Runs reference parents/origin messages in their Conversation; delegation rows
retain keyed intents and results. Only top-level active Runs use the per-Agent
unique index; `computer_held` coordinates child/parent Computer operations under
current execution leases and fences.

## Purpose

PostgreSQL persistence for the new account foundation.

## Interface

`.`: connectDatabase and migrateDatabase. `/connection`: runtime connection/types without migration imports.
`/schema`: the Better Auth tables (including the shared `rate_limit` store), control records and relations. `/env`: validated database configuration.

## Ownership

`model_connections` is account-owned metadata. `model_connection_secrets` is its
encrypted child, with a wrapped data key and key-provider selector. Composite
references bind owner/secret identity and cascade with connection/account deletion.
`model_connection_spaces` narrows availability to current owner memberships and
cascades when memberships or Spaces disappear without deleting the connection.
`conversation_tool_calls` retains bounded tool lifecycle metadata and deduplication
after event pruning; its Run/Space reference cascades. Approval settings carry a
monotonic revision for compare-and-swap writes.

PostgreSQL persistence for the new account foundation.

`spaces`, `space_members`, `agents` and `conversations` add the server-owned domain
without replacing device records. Space-owned primary keys start with `space_id`;
Conversation references to Agents include it. A unique Space/Agent pair permits
one direct Conversation. Features own scoped queries, API owns session admission.
Space membership removal retains a `removed_at` tombstone so Computer creators and
paused routine owners keep their composite keys. Only active rows authorize work.
`space_invitations` stores hashes, terminal states and same-Space retained inviter/
consumer references. `space_settings_overrides` stores a deliberate Space approval
mode exception. `space_audit` appends durable intent/outcome rows with historical
actor/target identities; no membership deletion erases that history. `space_events`
has independent ordered identities and a generated same-Space member subject key.
`space_deletion_jobs` retains a leased, fenced cleanup claim until final Space
deletion. Every new table cascades with its Space. Audit actors, setting editors and
deletion requesters are historical attribution, never current access selectors.
`spaces.private_for` is the unique account bootstrap marker, never a public field.
`conversation_messages`, `conversation_events` and `conversation_counters` use
Space/Conversation composite references. Messages retain the member-scoped retry
key; immutable events reference their content. The locked counter and retention
floor commit with event writes/pruning. `conversation_runs` pins message, member,
Agent model and instructions; a partial unique index permits one running Run per
Space/Agent. `conversation_reply_segments` stores completed text. State and segment
events use same-Space references; first-response time commits with segment output. `/connection` also exposes an owned,
dedicated LISTEN connection; feature adapters choose the channel and payload.

`computers` stores team/private scope, neutral provider, state, generation, home
revision and lifecycle lease/fence. One partial unique index permits one team
computer per Space; private Agent, creator member and event references include
space_id. Restrictive owner foreign keys prevent silent resource orphaning.
`computer.state` joins the existing conversation event counter/payload convention.

`approval_settings` and exact-tool/executable `approval_rules` are account-owned.
`approval_requests` references its Run and binds addressed/answering account IDs to
that Run's historical actor through same-Space composite foreign keys; `conversation_effects` records a hashed intent and bounded
outcome with the same Run boundary. Card event references include Space and
Conversation. Requests and effects cascade with their Run, not with current memberships.
Member/account removal cancels active Runs/requests and retains their history;
current membership still gates request admission and execution fences. The active Run index includes
`waiting` as well as `running`.

Durable Runs add lease owner/expiry, monotonically increasing fences and immutable
model/connection/computer selectors. Historical resource selectors survive removal
so recovery can fail explicitly. `conversation_run_attempts` stores each execution;
`conversation_run_checkpoints` stores the latest canonical history, pending calls
and open effects. Steering receipts and keyed delayed backup jobs are Space-owned
children of Runs. Their composite references cascade on Space deletion. Attempts
guard every write under a current lease/fence; backup claims use `SKIP LOCKED` and
never replace direct dispatch. Runtime construction does not query these tables.

## Constraints

Use postgres.js and Drizzle. Application tables and `public.__drizzle_migrations`
live in the dedicated Raypx database. Keep the `drizzle-foundation` history intact.
Generate new migrations with drizzle-kit. Never edit generated SQL or snapshots.
No reset/drop command or runtime dependency on auth, tooling or apps.
`studio` (root `db:studio`) opens Drizzle Studio with write access; only point it at the local foundation database.
Schema generation and Studio run through the private `@raypx/drizzle-kit` workspace.
Bun defaults to a process pool of ten connections. `statementTimeoutMs` and
`idleTransactionTimeoutMs` set server-side session bounds; request-serving callers
set them, the migrator never does. `/connection` keeps runtime
connections separate from filesystem-based migrations in `migrate.ts`.
API startup and explicit commands share the migrator's transaction-scoped advisory lock
before any ledger/schema access. Lock acquisition waits at most 120 seconds; subsequent
DDL lock waits are bounded to ten seconds. Migration, ledger and lock release commit or
roll back together. Keep the official Drizzle migrator inside that transaction.
The migrator moves the previous ledger into `public` before Drizzle reads it.
The API's `db:migrate` command can inject a provider import into the same
transaction after the schema applies. Database has no dependency on provider policy.
OAuth Provider and JWT signing tables live in `src/oauth-schema.ts`.
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

- Better Auth owns the passkey and two-factor records. Apply foundation migrations before enabling clients that use them.

`routines`, occurrences, deliveries and routine event metadata are Space-owned;
owner membership, Agent and Space removal cascade active definitions and their
credentials. `routine_identities` retains only Space/ID/time tombstones until Space
deletion. Active definitions and Run source IDs (including the generated inbound
JSON source ID) reference those tombstones with actual `space_id` composite FKs.
Routine events bind both their Run and their occurrence/Run tuple. Card events
retain a composite request FK including Space, Conversation and Run; requests
remain cancelled/resolved rows after their member/account disappears.

`space_memory_documents` and immutable revisions use same-Space Agent/document
keys; revision JSON identity must match its row. Shared knowledge survives author
membership removal, and author account deletion sets the nullable global-user FK
to null. Message/Run actor account IDs are historical deployment identities, not
membership grants. `conversation_run_memory_pins` binds the checkpoint and exact
memory revision with two Space-scoped FKs. Logical memory removal retains pins;
physical source deletion cascades only pin relations, preserving accepted context.
Checkpoint JSON cannot contain copied pin arrays. All tables are exposed by `/schema`.

Groups retain Agent participants and normalized message mentions with composite
Space foreign keys. Agent tombstones preserve message and Run attribution after
Agent deletion. Direct Conversation uniqueness is partial by kind. Run parent and
origin-message references and delegation intents/results remain in their original
Space/conversation, cascade with Space deletion and carry attempt fences.

Pages retain bounded immutable bodies, author provenance and mutation receipts in
`page_versions`; `page_share_links` stores only token hashes and optional same-Space
version pins. Skills separate account text/availability from Space-local learned
text; tombstones retain fenced mutation targets. Remote server secrets are encrypted
children of account-owned metadata. Agent skill/server selections bind current
member identity and Space through composite keys. Every new relationship cascades
with its owning record; soft membership removal explicitly clears selections.
