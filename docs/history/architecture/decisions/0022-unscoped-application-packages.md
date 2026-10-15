# ADR-0022: Unscoped application package names

## Status

Accepted, October 12, 2026.

## Context

The user requested application package names without the `@raypx/` prefix.
Application workspaces are private composition roots, while the scoped packages
under `packages/` are shared interfaces.

## Decision

Name the five application packages `web`, `api`, `desktop`, `worker` and
`storybook`. Keep their directories under `apps/`. Keep `packages/*` and the
separate E2E tooling workspace scoped as before.

Update Bun workspace resolutions, Turbo task IDs/filters, Docker prune targets,
manifest policy and development documentation together. Dependency-direction
checks identify workspaces by their actual names and continue to forbid runtime
imports of application composition roots.

## Consequences

The naming change affects repository commands and package metadata. Product
identifiers, installed Desktop identity, importable shared package names, RPCs
and stored data do not change.

## Follow-up

Use the same convention for future application composition roots.
