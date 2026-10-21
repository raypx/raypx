# @raypx/database

## Purpose

PostgreSQL persistence for the new account foundation.

## Interface

`.`: connectDatabase and migrateDatabase. `/connection`: runtime connection/types without migration imports.
`/schema`: the four Better Auth tables and relations. `/env`: validated database configuration.

## Ownership

PostgreSQL persistence for the new account foundation.

## Constraints

Use postgres.js and Drizzle. Active tables are in raypx_foundation; migration history uses raypx_foundation_migrations. drizzle and drizzle-cloud are historical archives and must never be applied to the new database. No reset/drop command. Generate new migrations with drizzle-kit; never edit generated SQL or snapshots. No runtime dependency on auth, tooling or apps.
Node defaults to a process pool of ten connections. Workers use `/connection` with
request-owned clients, bounded connection counts and no type-fetch round trip.
Keep filesystem-based migrations in `migrate.ts` and outside Worker runtime imports.

## Verification

```sh
bun run --cwd packages/database check
bun run --cwd packages/database test
DATABASE_URL=postgres://localhost/raypx_foundation_test bun run --cwd packages/database generate
```

Remote control records share the foundation schema and cascade with the account.
`control_owner` provides a transactional cross-instance account lock; payloads are
explicit domain projections. Changes require generated foundation migrations.
