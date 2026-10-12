# ADR-0008: Keep domain contexts in one core package until stable consumers exist

## Status

Application-service ownership superseded by [ADR-0014](./0014-domain-services-and-client-state.md). Domain package consolidation remains accepted.

## Context

Voidmix needs additional business areas for Workspaces, Projects, Assets and
sync, and Agent runs. The existing `@voidmix/core` package already owns the
business rules and repository ports, while application features live under the
Web and Desktop applications. Naming both a `core` package and a parallel
`domain` package would make ownership unclear and invite duplicate models.

The repository also deliberately delays new workspaces until a stable seam and
multiple real consumers exist. A package split is costly because it changes
exports, dependency graphs, tests, and the composition boundary even when the
underlying business rules have not changed.

## Decision

Keep `@voidmix/core` as the single domain-kernel package. Organize its source by
bounded context (`identity`, `workspace`, `projects`, `assets`, `agents`, and
`settings`) and keep each context's model, policies, application services, and
ports close together. The package root remains the narrow public export surface.

Use **feature** to describe an application-owned user capability. Web and
Desktop features may call contracts and client facades; they do not become
domain modules and do not compose server repositories.

Application services may remain inside `@voidmix/core` while there is one server
consumer. Extract a separate `@voidmix/application` package only when at least
two independent server consumers need the same orchestration and the split
reduces coupling. Extract `@voidmix/domain` only if a separately released or
deployed pure domain kernel is justified; never maintain `core` and `domain` as
parallel sources of truth.

Domain rules, authorization semantics, version/conflict policy, audit meaning,
and transaction invariants are not plugins. Providers for blobs, asset
processing, models, exports, and notifications may be registered as adapters
behind explicit ports.

## Consequences

The repository keeps one source of truth for entities, policies, errors, and
ports while new contexts can grow without a large shared `index.ts`. Frontend
features remain free to evolve their presentation and data loading without
leaking Hono, oRPC, Drizzle, or provider SDKs into the domain.

The core package will contain both pure rules and some orchestration until the
second server consumer appears. Context boundaries must therefore remain
explicit, and application query projections must not be mistaken for domain
entities. A future package extraction may require temporary compatibility
exports and coordinated changes across adapters and hosts.

## Follow-up

Revisit this decision when a worker or another independently deployed server
consumer needs application services, or when a package split can be shown to
remove a concrete dependency rather than only rename directories.
