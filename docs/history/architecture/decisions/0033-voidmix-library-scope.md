# ADR-0033: Voidmix library repository and npm scope

## Status

Accepted. Supersedes the repository name, npm scope and pinned versions in
ADR-0029, ADR-0030, ADR-0031 and ADR-0032, and the Shared environment
compatibility exports in ADR-0032. Their ownership boundaries, independent
releases and consumer verification remain.

## Context

ADR-0029 through ADR-0032 moved reusable Drizzle, Intl and Env implementations
into an independently released library repository, first called Raypx Toolkit
and then Raypx Packages, and published them under `@raypx/`. TypeScript presets
remained a product workspace, `@raypx/tsconfig`. The shared scope meant a
`@raypx/` name no longer said whether a package was a product workspace, so
policy and documentation needed a "Toolkit packages use catalogs even with the
`@raypx/` scope" exception.

The library repository is now [Voidmix](https://github.com/raypx/voidmix). It
republished the libraries under `@voidmix/` as Changesets alpha prereleases and
added the TypeScript presets as a fourth package.

## Decision

Consume `@voidmix/drizzle`, `@voidmix/env`, `@voidmix/intl` and
`@voidmix/tsconfig` from npm. They are external dependencies: each resolves
through a root Bun catalog (Env in the default catalog, Drizzle in `backend`,
Intl in `frontend`, TypeScript presets in `tooling`) and never through
`workspace:*`, a local link or an archive bridge. The catalogs pin exact
prerelease versions, and `bun.lock` records registry integrity.

`@raypx/` names only workspaces in this repository. Raypx no longer depends on
the earlier `@raypx/drizzle`, `@raypx/intl` or `@raypx/env` releases, and the
local `packages/tsconfig` workspace is removed.

Workspaces import environment APIs from `@voidmix/env` and declare it in their
own manifests; the `@raypx/shared/env` compatibility subpaths are retired.
`@raypx/i18n` remains the private product facade over `@voidmix/intl`, and
`@raypx/db` keeps schema, migration, permission and transaction ownership.

Earlier ADRs keep their original package and repository names as historical
record.

## Consequences

A package scope now states ownership: `@raypx/*` is always a workspace here and
`@voidmix/*` is always an external release. The manifest policy rejects
`workspace:*` for Voidmix packages.

Alpha prereleases may change their API between versions. Every upgrade is a
deliberate catalog and lockfile change followed by the owning workspace's tests
and `bun run verify`. No schema, migration or stored data changes.

## Follow-up

Revisit the pinning rule when Voidmix leaves Changesets pre mode and publishes
stable versions.
