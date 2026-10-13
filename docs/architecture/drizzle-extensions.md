# Drizzle extensions and Toolkit ownership

The extension library is maintained in the independent
[raypx/packages repository](https://github.com/raypx/packages), as `@raypx/drizzle`.
[ADR-0029](./decisions/0029-toolkit-drizzle-extraction.md) records extraction,
independent releases and the transition to published npm packages.

## Complete capability inventory

Toolkit owns the complete inventories and the combined implementation roadmap:

- [drizzle-plus inventory](https://github.com/raypx/packages/blob/main/docs/drizzle/drizzle-plus-capabilities.md)
  covers query/select extensions, all shared and dialect SQL functions, generated
  entrypoints, low-level helpers and public types.
- [better-drizzle inventory](https://github.com/raypx/packages/blob/main/docs/drizzle/better-drizzle-capabilities.md)
  covers CRUD/batches, filters, relations, transactions, prepared reads, diagnostics,
  every plugin, runtime rules, ESLint rules, error codes and type declarations.
- [Merge and extension design](https://github.com/raypx/packages/blob/main/docs/drizzle/merge-plan.md)
  defines canonical semantics, dialect/public-API boundaries, compatibility
  adapters, plugin lifecycle and staged acceptance.

All upstream capabilities are recorded whether or not Raypx uses them. Inventories
are not lists of implemented exports. Declared-but-unimplemented rules, generated
private modules and actual published entrypoints are identified separately.

[ADR-0031](./decisions/0031-postgres-js-only-drizzle.md) records the driver scope
and entrypoint migration.

## Supported database and driver

The implementation targets PostgreSQL through `postgres` (postgres.js) and
`drizzle-orm/postgres-js` only. Public SQL helpers use `@raypx/drizzle/postgres`;
the earlier `/pg` export is removed. Drizzle's `pg-core`, `PgTable` and `PgDialect`
remain its canonical PostgreSQL schema and SQL APIs.

The extension does not support node-postgres (`pg`), Bun SQL, PGlite, MySQL or
SQLite. Complete upstream inventories retain their capabilities as reference,
with other drivers/dialects explicitly outside the implementation plan.

## Current consumer surface

| Package import               | Raypx use                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------- |
| `@raypx/drizzle`             | Typed member-column omission                                                 |
| `@raypx/drizzle/postgres`    | Explicit UPSERT fields; bound JSONB paths and CASE-guarded scalar conversion |
| `@raypx/drizzle/errors`      | postgres.js `constraint_name` recognition before Core error translation      |
| `@raypx/drizzle/results`     | Nullable select and required returning-row unwrapping                        |
| `@raypx/drizzle/diagnostics` | EXPLAIN construction and sanitized node metrics                              |

DB owns query/catalog composition and runtime connections. The production Cloud
queue and expiry queries share SQL builders with diagnostics. Account usage
shares the same aggregate builder; malformed non-number accounting values are
rejected rather than silently omitted by nullable JSON helpers, and aggregate
numbers must be finite. Missing and JSON-null optional usage values still follow
the existing zero-aggregate behavior.

Project visibility, scope-bound cursor encoding, permissions, immutable rounds,
owner fencing, locks, events and physical schema compatibility remain in DB/Core.
The complete future query facade and plugins are not added to Raypx composition.

## Development diagnostics

`rpx db explain` is limited to development/test and these four named queries:

```bash
bun run db:explain --query queued-runs --limit 20
bun run db:explain --query expired-runs --now 2026-10-13T00:00:00Z
bun run db:explain --query visible-projects --actor-id alice --limit 20
bun run db:explain --query account-usage --account-id user:alice \
  --from 2026-10-01T00:00:00Z --until 2026-11-01T00:00:00Z
bun run db:explain --query queued-runs --analyze --buffers --json
```

Default EXPLAIN only plans. Explicit `--analyze` executes the read. The dedicated
connection uses a read-only transaction, local statement/lock timeouts and
bounded cleanup. The command accepts no arbitrary SQL and outputs only approved
plan fields. Database errors are converted to fixed diagnostic codes/messages;
query text, parameter values, predicates and credentials do not enter the report.

## Verification and upgrades

Toolkit's own verify gate checks code, the actual published archive shape,
isolated Bun/Node consumers and independent Changesets versioning. Raypx then
runs DB unit tests, guarded PostgreSQL tests, generation with no schema drift and
`bun run verify`. See [testing](../development/testing.md).

The exact Drizzle RC remains the package peer version; a broad upstream peer
range alone cannot justify an upgrade. The root backend catalog pins the
published `@raypx/drizzle@0.0.0`; Bun records registry integrity in `bun.lock`.
Upgrade only to a verified registry release, then regenerate the lockfile and
run the product compatibility gate. The pre-publication archive bridge is retired.
