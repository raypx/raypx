# ADR 0059: Manifest workspace boundaries

Date: 2026-11-12

Status: Accepted. Supersedes [ADR 0058](0058-derived-source-platforms.md) and the
platform metadata and checks in [ADR 0043](0043-package-surfaces.md).

## Context

Policy inferred host constraints by tracing exports and imports and used the
same information to narrow browser changes in verification. Workspaces already
select their compiler presets, build targets and acceptance suites for the hosts
they support. The manifest targets also doubled as a signal for tooling roles.

## Decision

- Derive workspace kind from the standard manifest. A package with `bin` is
  executable tooling. A package without `bin` or `exports` is an application.
  A package with `exports` and no `bin` is a library.
- Reject `raypx.kind`, `raypx.target`, `raypx.entryTargets` and
  `raypx.sourceTargets` in manifests. `workspace new --target` selects only the
  TypeScript preset and types. Generated layouts support `app` and `library`.
- Remove host API, DOM global and entry platform compatibility checks from
  policy. TypeScript presets, builds and host-specific acceptance cover their
  respective environments. Policy still checks public exports, direct dependency
  declarations, application imports, executable tooling, test-only entries and
  dependency cycles.
- Keep verification scoped to affected workspaces. Follow manifest dependents
  transitively for source changes and keep private tests and runner configuration
  scoped to their owner. Native acceptance uses its own input selection.
- Count test consumers for E2E workspace exports such as `./journeys/*`. Each
  export still needs an importer or a documented exception.

## Consequences

A frontend edit can reach the API through shared workspace dependencies and
select backend integration in CI. Export-only build helpers such as
`@raypx/tooling` are classified as libraries. The runtime import rule for
tooling applies to workspaces with `bin`, while direct dependency and public
entry rules apply to all workspaces.
