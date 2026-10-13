# @raypx/db

## Purpose

The database adapter. It hides Drizzle and PostgreSQL behind the repository
interfaces owned by `@raypx/core`.

## Interface

| Path       | Purpose                                                     |
| ---------- | ----------------------------------------------------------- |
| `.`        | repositories, connection helpers, migrate/reset, re-exports |
| `./env`    | the database environment preset                             |
| `./schema` | Drizzle tables, enums, and the `schema` aggregate           |

Source layout: `index.ts` exports repositories directly, `connection.ts` owns
connections and migration execution, `repositories/` owns Cloud, blob and
settings adapters, and `v2/` owns canonical project/resource adapters.
`repositories/settings/values.ts` shares pure configuration resolution.
`schema.ts` exposes active tables; `schema/migrations.ts` includes all physical
tables, with retired definitions in `schema/compatibility.ts`. Historical SQL
remains under `drizzle/`; the current baseline lives under `drizzle-cloud/`.
See [database architecture](../../docs/architecture/database.md).
See [ADR-0013](../../docs/architecture/decisions/0013-domain-modules-and-retired-code.md).

## Ownership

- Own the Drizzle schema, canonical V2 resource, blob and system-settings
  repositories in PostgreSQL and memory, and
  migration execution.
- Local blob storage may read a legacy root for existing blobs and upload
  intents. New writes use the current root; deletion removes both copies.
- Own `PostgresCloudRepository` and `InMemoryCloudRepository`, cloud indexes,
  JSON-backed typed records with indexed ownership/parent/intent columns, ordered
  events and atomic queued-Run writes. Reads restore native Date fields without
  coercing arbitrary tool bodies; Round usage and owner account queries use indexed columns.
- Cloud account/run/task advisory locks are acquired in sorted order. Active
  task Runs also have a partial unique index. User/project permission rows are
  read through the same transaction handle.
- Account usage aggregates on that transaction handle without loading complete
  histories. Monthly call totals and lifetime storage/active Runs match memory;
  aggregate numeric values are converted to JavaScript numbers explicitly.
- Run lease expiry, epoch, cancellation and account/round identities are indexed
  columns alongside their typed data. Critical active-Task and expired-Run queries
  have semantic Core ports; message projections and grant hashes commit durably.
- Independent Worker identities may run concurrently. The optional dedicated
  session guard only rejects duplicate live host identities; it never replaces
  the per-Run expiring lease or prevents another host from claiming a different Run.
- Both adapters reject changes to an existing TaskRound. SQL enforces one active
  Run per Task and one round per goal version; Application guards acceptance and
  publication under the same account/Run/Task locks.
- Shared Cloud test helpers under `tests/` stay TypeScript-only. Both Vitest
  configs resolve the four helper imports to their `.ts` sources so incidental
  CommonJS output cannot shadow them or enter the Vite+ runner.
- Own no business rule and no interface definition — both belong to
  `@raypx/core`.

## Constraints

- Never expose tables or Drizzle types to frontend applications. Web and Desktop reach the backend through `@raypx/client` and
  `@raypx/contracts`.
- PostgreSQL and in-memory implementations must be updated together when a
  domain repository interface changes and both implement that port.
- Project visibility SQL must match Core for personal owners/collaborators and
  organization membership. Resource lists filter in SQL before keyset pagination.
- No limit/cursor means a complete list. Paged queries sort timestamp + ID;
  cursors bind to actor and query scope and invalid cursors raise BAD_REQUEST.
- Queued Agent creation commits the Run, Turn/Round and admission facts in one
  transaction. Both adapters list and claim queued Runs without a dispatch-ready gate.
- Outbox, notification and preference tables, the dispatch-ready column and their
  historical SQL remain schema-local compatibility data. Their runtime ports and
  writes are retired; do not DROP data or add a migration for this removal.
- Legacy Workspace/local tables and their exclusive enum definitions have no
  active source consumer and are retired. Preserve their historical SQL and
  existing data; do not apply the old baseline to a new database.
- Device-bound execution and Project AgentRun adapters/schema definitions are
  retired. Preserve historical SQL and stored data; their removal needs no
  change to the current Cloud migration baseline.
- Auth policy reuses `system_settings` with the fixed keys
  `auth.registration_mode`, `auth.allowed_email_domains`,
  `mail.welcome_enabled`, `mail.verification_enabled`, and
  `mail.password_reset_enabled`; it never exposes an arbitrary key/value API.
- Schema idioms: enums first with the `Enum` suffix and a snake_case PostgreSQL
  name; the third `pgTable` argument is the **array** form (Drizzle 1.0 RC),
  not the legacy object form; index names are `<table>_<cols>_idx`; camelCase
  TS keys map to explicit snake_case columns; timestamps are always
  `{ withTimezone: true, mode: "date" }` so native `Date` survives end to end.
- Export new tables from the owning schema domain module. `schema/tables.ts`
  aggregates those namespaces, while `schema.ts` exposes the schema subpath.
  Add a new domain to both entrypoints; export from the root only for a backend
  consumer. Retired historical tables stay outside the active aggregate.
- Generate only from `schema/migrations.ts`, which includes active and retained
  compatibility tables. Runtime exports and Auth relations exclude retired
  audit, outbox, notification and preference tables; that must never imply a DROP.
- Keep runtime relations in `schema/relations.ts`. Better Auth uses relational
  queries over Auth tables only; domain adapters use explicit joins. Persisted foreign keys belong
  to table definitions and are independent of this runtime relation graph.
- **Never hand-edit generated migrations.** Each lives in its own
  `drizzle-cloud/<timestamp>_<name>/` with `migration.sql` and `snapshot.json`
  (Drizzle 1.0 RC; there is no `_journal.json`). Regenerate instead, and do not
  invent directory names.
- `generate` exits 2 with `missing_hints` when a diff is ambiguous — it cannot
  tell a rename from a create. Re-run with the `--hints '<json-array>'` it
  prints; `bun run generate` and `db push` forward flags for exactly this.
- A foreign key on a **generated** column (`audit_events.target_user_id`) may
  only use `restrict`/`no action`. PostgreSQL rejects any action that would have
  to write the column, so `onUpdate: "cascade"` fails at migrate time, not at
  generate time.
- `drizzle.config.ts` calls `getDatabaseEnv()` at module load, so `drizzle-kit`
  fails at import time when `DATABASE_URL` is missing or invalid.
- `db push`, `db clean`, and `db studio` are restricted to
  development and test by `@raypx/scripts`; `db migrate` only requires a
  database URL.
- `db push` applies the schema without a migration, so it is for a database in
  flux only. Committed schema changes still ship as generated `drizzle-cloud/` migrations.
  It forwards its flags to `drizzle-kit`, because an ambiguous diff exits 2 and
  demands `--hints '<json-array>'`.
- `resetDatabase` (`db clean`) drops the `drizzle` and `public` schemas and
  recreates an empty `public`. It destroys data and migration history without
  prompting, so the environment guard is the only protection.
- User-administration repositories, settings mutation/audit adapters and Cloud
  Admin diagnostics are retired. Keep persisted users, role/status enums,
  system settings/secrets and audit tables for existing data and baseline
  compatibility; no runtime audit consumer remains. Do not DROP them as code cleanup.

## Verification

```bash
bun run --cwd packages/db check
bun run --cwd packages/db test
NODE_ENV=test TEST_DATABASE_URL=postgres://localhost/raypx_local_test bun run test:postgres
bun run --cwd packages/db generate   # or repo-wide: bun run generate
bun run db:migrate
```
