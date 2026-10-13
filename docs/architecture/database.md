# Database

The database adapter implements Core repository ports. API and Worker compose
repositories through the package root; browser applications use Client and
Contracts. The adapter has one connection module and direct repository exports,
without internal forwarding entrypoints.

## Schema boundaries

| Graph               | Entry                                  | Contents                                                                  |
| ------------------- | -------------------------------------- | ------------------------------------------------------------------------- |
| Runtime             | `packages/db/src/schema.ts`            | Auth/settings, projects, resources and Cloud tables with active consumers |
| Auth relations      | `packages/db/src/schema/relations.ts`  | Better Auth tables and their user/account/session relationships           |
| Physical migrations | `packages/db/src/schema/migrations.ts` | Runtime definitions plus retained compatibility definitions               |

The current physical graph contains 37 tables. Four retired tables live in
`schema/compatibility.ts`: `audit_events`, `outbox_events`,
`cloud_notifications`, and `cloud_preferences`. They do not enter runtime
exports or the Auth relation graph, but remain in the migration graph to preserve
existing data. Historical audit enum values and the Run `dispatch_ready` column
also remain compatible. Auth/Mail continue to read settings and secrets.

Moving a table out of runtime composition does not authorize removing it from
the physical database. Drizzle generation always uses the full physical graph.
Existing migrations in `drizzle-cloud/` and historical SQL in `drizzle/` remain
unchanged; a source-only simplification must produce no migration drift.

## Repositories

`connection.ts` owns PostgreSQL connections, migration execution and the internal
database type. The public root exports concrete adapters directly. Settings
adapters call shared pure resolvers rather than inheriting a reader class.
Project/resource adapters retain explicit typed SQL, SQL visibility filters,
actor-bound keyset cursors and locked membership changes.

Cloud shares entity metadata between memory and PostgreSQL adapters. PostgreSQL
constructs each write from one named column/value mapping, so indexed fields and
JSON records cannot drift through parallel arrays. Local read helpers decode
records consistently. Account/Run/Task locks, immutable rounds, owner epochs,
leases, event uniqueness and atomic publication remain database guarantees.

JSON decoding restores domain Date fields and the bounded mutation replay DTO.
Arbitrary tool input, output, event payloads and nested source content remain JSON;
their date-shaped strings are evidence, not domain timestamps.

## Verification

Run the DB workspace checks before the whole repository gate:

```bash
bun run --cwd packages/db check
bun run --cwd packages/db test
DATABASE_URL=postgres://raypx:ci@example.invalid:5432/raypx bun run generate
bun run verify
```

Generation uses a valid, non-routable URL and does not connect to a database.
Source refactoring should report no schema changes or generated-file drift.

Real SQL behavior is verified separately against an explicit PostgreSQL 17 test
database, using the guard described in [testing](../development/testing.md):

```bash
NODE_ENV=test TEST_DATABASE_URL=postgres://localhost/raypx_local_test bun run test:postgres
```

Project visibility and cursor tests instantiate the real PostgreSQL repository.
Cloud tests cover concurrent admission/claim, ownership fencing, transactional
rollback, Date replay and unknown JSON, usage aggregation and immutable rounds.
