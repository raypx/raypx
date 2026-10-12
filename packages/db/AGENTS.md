# @voidmix/db

## Purpose

The database adapter. It hides Drizzle and PostgreSQL behind the repository
interfaces owned by `@voidmix/core`.

## Interface

| Path       | Purpose                                                     |
| ---------- | ----------------------------------------------------------- |
| `.`        | repositories, connection helpers, migrate/reset, re-exports |
| `./env`    | the database environment preset                             |
| `./schema` | Drizzle tables, enums, and the `schema` aggregate           |

Source layout: small compatibility entrypoints (`schema.ts`, `postgres.ts`,
`memory.ts`, `v2.ts`); domain implementations under `identity/`, `settings/`,
`v2/`, and `schema/`. `settings/reader.ts`, `settings/values.ts`, and
`settings/mutations.ts` share resolution, decoding, and mutations across adapters. Historical SQL remains under `drizzle/`; the independent current baseline lives
under `drizzle-cloud/`.
See [ADR-0013](../../docs/architecture/decisions/0013-domain-modules-and-retired-code.md).

## Ownership

- Own the Drizzle schema, user, canonical V2 resource, outbox, blob, and
  system-settings repositories in PostgreSQL and memory, plus migration
  execution.
- Own `PostgresCloudRepository` and `InMemoryCloudRepository`, cloud indexes,
  JSON-backed typed records with indexed ownership/parent/intent columns, ordered
  events and atomic outbox writes. Reads restore native Date fields without
  coercing arbitrary tool bodies; Round usage and owner account queries use indexed columns.
- Cloud account/run/task advisory locks are acquired in sorted order. Active
  task Runs also have a partial unique index. User/project permission rows are
  read through the same transaction handle.
- Run lease expiry, epoch, cancellation and account/round identities are indexed
  columns alongside their typed data. Critical active-Task and expired-Run queries
  have semantic Core ports; message projections and grant hashes commit durably.
- Independent Worker identities may run concurrently. The optional dedicated
  session guard only rejects duplicate live host identities; it never replaces
  the per-Run expiring lease or prevents another host from claiming a different Run.
- Both adapters reject changes to an existing TaskRound. SQL enforces one active
  Run per Task and one round per goal version; Application guards acceptance and
  publication under the same account/Run/Task locks.
- Own no business rule and no interface definition — both belong to
  `@voidmix/core`.

## Constraints

- Never expose tables or Drizzle types to frontend applications. Web (including
  its Admin routes) and Desktop reach the backend through `@voidmix/client` and
  `@voidmix/contracts`.
- PostgreSQL and in-memory implementations must be updated together when a
  domain repository interface changes.
- User administration uses one transaction-level advisory lock for bootstrap
  and status changes. Count, mutation and audit commit together. Memory serializes
  the same operation and publishes its cloned state only on success.
- Project visibility SQL must match Core for personal owners/collaborators and
  organization membership. Resource lists filter in SQL before keyset pagination.
- No limit/cursor means a complete list. Paged queries sort timestamp + ID;
  cursors bind to actor and query scope and invalid cursors raise BAD_REQUEST.
- Queued Agent creation inserts the run and outbox event in the same transaction.
  All statements in that operation use the transaction handle.
- Legacy/local table definitions and adapter sources remain historical. They
  are excluded from the runtime schema aggregate, public schema exports and
  new migration baseline; do not apply the old baseline to a new database.
- Auth policy reuses `system_settings` with the fixed keys
  `auth.registration_mode`, `auth.allowed_email_domains`,
  `mail.welcome_enabled`, `mail.verification_enabled`, and
  `mail.password_reset_enabled`; it never exposes an arbitrary key/value API.
- Auth policy updates and their redacted `system.settings.updated` audit event
  are one transaction in PostgreSQL. A no-op update must not append an audit
  event.
- Mail and Auth mutations are partial. Omitted fields are untouched, `set` or
  `replace` upserts one fixed key, and `reset` deletes that key so resolution
  falls back to environment/default state. An absent reset is a no-op.
- Settings audit metadata contains only changed field names, mutation operations,
  and the result. Never include domain lists, effective policy values, or secret
  material.
- `InMemoryUserRepository` must **clone on read and on write**
  (`{ ...user }`, `{ ...event, metadata: { ...event.metadata } }`) so tests
  cannot mutate stored state.
- Schema idioms: enums first with the `Enum` suffix and a snake_case PostgreSQL
  name; the third `pgTable` argument is the **array** form (Drizzle 1.0 RC),
  not the legacy object form; index names are `<table>_<cols>_idx`; camelCase
  TS keys map to explicit snake_case columns; timestamps are always
  `{ withTimezone: true, mode: "date" }` so native `Date` survives end to end.
- Export new tables from the owning schema domain module. `schema/tables.ts`
  aggregates those namespaces, while `schema.ts` exposes the schema subpath.
  Add a new domain to both entrypoints; export from the root only for a backend
  consumer. Keep the historical scheduled-task aggregate exclusion intact.
- Keep runtime relations in `schema/relations.ts`. Better Auth uses relational
  queries; domain adapters use explicit joins. Persisted foreign keys belong
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
- `db seed`, `db push`, `db clean`, and `db studio` are restricted to
  development and test by `@voidmix/scripts`; `db migrate` only requires a
  database URL.
- `db push` applies the schema without a migration, so it is for a database in
  flux only. Committed schema changes still ship as generated `drizzle-cloud/` migrations.
  It forwards its flags to `drizzle-kit`, because an ambiguous diff exits 2 and
  demands `--hints '<json-array>'`.
- `resetDatabase` (`db clean`) drops the `drizzle` and `public` schemas and
  recreates an empty `public`. It destroys data and migration history without
  prompting, so the environment guard is the only protection.
- A new audit-action value is also declared in `@voidmix/core` (literal union)
  and `@voidmix/contracts` (`z.enum`). All three plus a migration must land
  together.

## Verification

```bash
bun run --cwd packages/db check
bun run --cwd packages/db test
NODE_ENV=test TEST_DATABASE_URL=postgres://localhost/voidmix_local_test bun run test:postgres
bun run --cwd packages/db generate   # or repo-wide: bun run generate
bun run db:migrate
```
