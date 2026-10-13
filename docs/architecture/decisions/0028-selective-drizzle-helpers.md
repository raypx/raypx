# ADR-0028: Selective Drizzle helper forks

## Status

Accepted

## Context

Raypx uses Drizzle `1.0.0-rc.5-5935859`, explicit repository ports and the original
database/transaction handles. Membership queries repeat column projections and
UPSERT assignments. Raw PostgreSQL uniqueness failures also differ from the
equivalent memory adapter's domain errors.

Two upstream projects provide useful helper implementations:

- [drizzle-plus](https://github.com/alloc/drizzle-plus) at
  `5840bdb4c5b3c7526b7db132f0b14cbe8a89eae9`, MIT. Its broad Drizzle v1 peer range
  does not verify compatibility with every release candidate. Many extensions
  change global prototypes or access query-builder internals.
- [better-drizzle](https://github.com/almeidazs/better-drizzle) at
  `f93f1b7aa528fe2db4cddc92a047e7a0ae710a0d`, Apache-2.0. Its declared peer range
  `>=1.0.0-rc.4 <1.0.0-rc.5` excludes Raypx's current version. Its complete client
  facade would add a second query API and relation/compiler implementation.

## Decision

Adapt only the helpers with current repository consumers into private
`packages/db/src/query/` modules. Keep upstream packages out of dependency
manifests. Preserve the original Drizzle client, transaction scopes and Core
repository contracts; do not add runtime prototype patches.

| Capability                               | Consumer                                    | Preserved boundary                                                          |
| ---------------------------------------- | ------------------------------------------- | --------------------------------------------------------------------------- |
| Typed column omission                    | Project and organization member projections | Return only membership fields without mutating table metadata               |
| Explicit excluded-column mapping         | Project member and Cloud UPSERTs            | Quote physical column names; preserve explicit update keys/conflict targets |
| PostgreSQL unique-constraint recognition | Cloud Run/event writes                      | Match SQLSTATE and exact constraint; leave unknown errors unchanged         |

The Run active-Task constraint maps to `CLOUD_RUN_ACTIVE`. An event sequence
primary-key conflict maps to `CLOUD_IDEMPOTENCY_CONFLICT`. Both match memory
adapter behavior. Failed writes still escape the transaction and roll back all
earlier changes. Recognized domain errors do not expose underlying query text or
parameters. Other unique constraints and database failures remain original errors.

Retain fixed source commits, full license texts, copyright and modification
notices in [DB third-party provenance](../../../packages/db/third-party/NOTICE.md).
These modules belong to DB implementation, with no public package subpath or
frontend import path.

## Consequences and verification

Raypx maintains a small adapted surface using public Drizzle APIs and error
metadata. It does not inherit upstream's generated clients, private query fields,
extra dependencies, cache/hook behavior or generic pagination contracts.
Actor-bound cursors, visibility checks, membership locks, immutable rounds, owner
fencing and the full physical migration graph remain unchanged.

Type checks and helper tests cover column inference, physical snake_case names,
quoted identifiers, exact constraint metadata, wrapped errors and cyclic causes.
Real PostgreSQL tests cover member UPSERTs, adapter error parity, retained rows,
transaction rollback and unknown-error propagation. `bun run generate` must
report no schema drift, followed by the complete `bun run verify` gate.
