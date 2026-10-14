# ADR-0031: PostgreSQL and postgres.js extension scope

## Status

Accepted. Narrows the implementation scope recorded in ADR-0029; complete
upstream capability inventories and source provenance remain.
Package name and pinned version are superseded by
[ADR-0033](./0033-voidmix-library-scope.md).

## Context

The user requested using the `postgres` npm driver only, without `pg` /
node-postgres compatibility. Product DB already uses postgres.js through
Drizzle's `postgres-js` adapter. The generic helper path `/pg` and multi-driver
roadmap obscured the intended compatibility boundary.

## Decision

`@raypx/drizzle` targets PostgreSQL with postgres.js (`postgres`) and the
`drizzle-orm/postgres-js` adapter. PostgreSQL helpers use `/postgres`; `/pg` is
removed. Drizzle's `pg-core`, `PgTable` and `PgDialect` are its canonical
PostgreSQL schema and SQL APIs and remain unchanged.

Column projection accepts PostgreSQL tables. Unique-constraint recognition uses
postgres.js `constraint_name` with SQLSTATE and cycle-safe causes, without a
node-postgres `constraint` fallback. The exact tested driver version is recorded
in package peer metadata; the peer is optional for SQL-expression-only usage,
which does not create connections. Existing consumer pools and transactions
remain consumer-owned.

The query/transaction/plugin design binds to public PostgresJsDatabase and
PostgresJsTransaction APIs. It does not introduce switchable driver adapters or
promise node-postgres, Bun SQL, PGlite, MySQL or SQLite support. Upstream-specific
capabilities remain complete reference inventories, marked outside the current
implementation scope.

## Consequences

There is one database/driver validation target and one error metadata contract.
The root backend catalog pins the published `@raypx/drizzle@0.0.0`, and the
lockfile records the registry artifact's integrity.
PostgreSQL tests verify native driver constraint metadata and DB behavior after
the public entrypoint migration. Stored schemas and migrations are unchanged.
