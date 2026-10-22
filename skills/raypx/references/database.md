# Database

Package: `@raypx/database` ([AGENTS](../../../packages/database/AGENTS.md)). PostgreSQL via
postgres.js and Drizzle; migrations with `@raypx-kit/drizzle-kit`.

- Entries: `.` (`connectDatabase`, `migrateDatabase`), `/connection` (runtime only,
  Worker-safe), `/schema` (Better Auth tables), `/env` (validated configuration).
- Active tables live in schema `raypx_foundation`; history in `raypx_foundation_migrations`.
- `rate_limit` is the shared store for Better Auth and RPC limits ([security](security.md)).
- Change `/schema`, run `bun run db:generate`, review the SQL, then `bun run db:migrate`.
  Never edit generated SQL/snapshots and never apply `drizzle`/`drizzle-cloud` archives.
- There is no reset/drop command. Never point migrations at the retired database.
- Node uses a pool of ten; Workers create request-owned clients (Hyperdrive optional,
  with query caching disabled for auth).
- Real-database tests: `bun run test:postgres` with an isolated `*_test` database.
