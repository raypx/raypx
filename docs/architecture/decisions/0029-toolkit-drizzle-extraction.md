# ADR-0029: Independently released Toolkit libraries

## Status

Accepted. Supersedes the private DB helper location and current-consumer-only
inventory limit in ADR-0028; its public-API, transaction and data safeguards remain.

## Context

The requested Drizzle extension inventory covers every capability in drizzle-plus
and better-drizzle, including capabilities Raypx does not currently consume.
The user requested a separate `raypx/toolkit` repository with independently
versioned packages, following TanStack Config's multi-package release structure.

## Decision

Maintain reusable libraries in [Raypx Packages](https://github.com/raypx/packages).
Its first package is `@raypx/drizzle`, with compiled ESM, declarations, explicit
subpaths and Drizzle as a peer. It has no product workspace runtime dependencies.
Inventory and merge design are maintained with the implementation in Toolkit.

Changesets has empty fixed and linked groups. Every package owns its version,
CHANGELOG and release tags; creating the repository does not publish to npm.
Version PRs and authenticated npm publication are separate workflow stages.

Raypx DB consumes this package through the root Bun catalog. Until the first
registry publication, a versioned tarball under `vendor/` supplies a reproducible
consumer, with its checksum and source metadata recorded there. Docker build
stages copy it before frozen dependency installation. This is a compiled release
snapshot; there is no second maintained helper implementation in this repository.
After the first npm publication, replace the catalog archive with that explicit
registry version and regenerate the lockfile.

Only reusable column, JSONB, result, constraint and plan helpers move out.
Raypx retains schemas/migrations, Core ports, permissions, account usage policy,
actor-bound cursors, transaction connections, Run locks/leases/epochs and domain
error translation. Diagnostics use a fixed read catalog, dedicated read-only
transactions and PostgreSQL-enforced timeouts; SQL parameters and raw plans are
excluded from the report.

## Consequences

Toolkit can evolve without Raypx product releases. Runtime helper source and
provenance have one owner, while package upgrades remain deliberate consumer
changes. Full upstream capability inventories distinguish implemented, planned,
private and declaration-only behavior. The extension design does not promise
every upstream feature as shipped code.

Package extraction and consumer verification use actual tarballs, declarations,
Bun/Node loading, PostgreSQL 17 behavior and the complete Raypx verification gate.
The exact tested Drizzle RC remains the peer boundary. No schema migration is
required, and existing stored data and SQL history remain unchanged.

## Follow-up

Revisit the archive bootstrap after npm scope access and the first publication
are available. Expand peer/dialect support only after the corresponding real
database and type matrix passes. Additional Toolkit packages need stable APIs,
ownership and their own release history.
