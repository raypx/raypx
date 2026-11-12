# ADR 0043: Package surfaces

Memory/job model ownership and the corresponding dependency consequences are superseded by [ADR 0048](0048-core-feature-models.md).
Server persistence placement is superseded by [ADR 0049](0049-feature-server-ownership.md).
The former external Intl SDK dependency is superseded by [ADR 0055](0055-in-repo-intl-runtime.md).
The `raypx.sourceTargets` declaration is superseded by [ADR 0058](0058-derived-source-platforms.md).

Status: Accepted, 2026-11-03. Extends ADR 0042. Revised 2026-11-10: memory and
scheduled jobs are one workspace each instead of separate `-model` and `-server`
workspaces, and this record now states the current decision in full.

## Context

A workspace can be imported through one root that re-exports everything, or through
named entries. A mixed root hides which layer a module belongs to and gives every
consumer the union of every other consumer's dependencies: Web's sign-in chunk once
carried relay scheduling because both came from the `@raypx/client` root.

A domain such as memory or scheduled jobs also has three audiences with different
platforms: pure schemas for transports and devices, injected use cases for Node
hosts, and views for browsers. They need separate dependency boundaries, but a
boundary does not have to be a workspace.

## Decision

A package entry is a surface, not a barrel. Each public subpath carries one cohesive
responsibility and a consumer imports the surface it operates on.

- **No mixed roots.** A root entry exists only where it is itself one surface, as in
  `account`, `instances`, `database` and `logger`. No root re-exports another
  workspace's vocabulary or several unrelated concerns.
- **Every public entry has a consumer** in another workspace. An entry nobody imports
  is removed, not kept for a possible future use.
- **A platform boundary is an entry before it is a workspace.** One workspace may hold
  universal, Node and browser surfaces when `raypx.entryTargets` and
  `raypx.sourceTargets` declare them. A separate workspace is justified by a separate
  responsibility or release, not by a platform difference alone.
- **A domain schema is imported from its owner.** Contracts composes wire messages
  from domain models and does not re-export them.

## Surfaces

### Client

`@raypx/client` has no root and splits by transport concern:

- `/api`: `createApiClient`, its option and header types, `FetchCallable` and
  `isMissingProcedure`.
- `/relay`: `RelayConnection`, `relayUrl`, `RelaySocketFactory` and the scheduler
  vocabulary (`RelayScheduler`, `systemRelayScheduler`).
- `/tasks`: `createTaskClient` and `TaskClient`.

Relay frames and task changes are wire vocabulary. Consumers import them from
`@raypx/contracts/tasks`, where they are authored.

### Tasks

`@raypx/tasks` has no root. `/model` owns page state, injected view ports and the pure
task helpers; `/client` and its sub-entries adapt that model to React. Domain types
come from `@raypx/core/tasks` and `@raypx/contracts/tasks`.

### Memory and scheduled jobs

`@raypx/memory` and `@raypx/jobs` each expose three surfaces:

| Entry     | Target    | Owns                                                           |
| --------- | --------- | -------------------------------------------------------------- |
| `/model`  | universal | Schemas, inferred types, errors and pure calendar calculations |
| `/server` | node      | Injected use cases and repository ports                        |
| `/client` | browser   | Views and their injected ports                                 |

`/client` and `/server` import `/model` by relative path and never each other.
Persistence, identity, authorization, relay and clocks stay with the caller of
`/server`; applications own routing and authentication around `/client`.

Each surface was briefly its own workspace. The model and server workspaces held
between 70 and 310 lines of source behind a full set of manifest, compiler, task and
instruction files, and the target metadata already expresses the same boundary for
`account` and `instances`. The cost of merging is stated under Consequences.

### Contracts

`@raypx/contracts` has no root and no `/jobs` or `/memory` entry. It composes wire
schemas from `@raypx/jobs/model`, `@raypx/memory/model` and Core. A consumer that needs
a domain schema imports it from that owner.

### Accounts

Public account and session types, social provider identifiers, trusted-origin
normalization and the post-login destination rule live in `@raypx/core/auth`, beside
Core's permission vocabulary. Better Auth and the shared authentication forms stay in
`@raypx/auth`. There is no separate auth model workspace.

## Enforcement

Tooling's `policy` rejects a violation of any rule above:

- Entry and source targets keep each surface on its platform. A browser import of a
  `node` entry fails, even though Bun could execute it.
- The `contracts` source layer forbids React, `ui`, `i18n`, `icons`, `client`, `auth`
  and every `/server`, `/client` or `/crypto` subpath, transitively from
  `packages/contracts/src/`. Every layered owner also shares the infrastructure rule:
  no OS or runtime host module, Drizzle, database or provider package.
- The entry-consumer check requires each `exports` key of a library or tooling
  workspace to have an importer in another workspace or in repository-root
  configuration. Suites, files under `tests/` and the `e2e` workspace count as test
  importers: they are enough for `./testing*` entries and tooling workspaces, not for
  a library's production surface.

A deliberate exception records its reason in `raypx.entryConsumers`, validated against
the exported keys. Three exist:

- `i18n/config` is read as a file by Tooling's static catalog reader.
- `devtools/renderer` is injected as a module path string by the Vite plugin.
- `infra/railway` (`.`) is an IaC program the Railway CLI evaluates under Bun.

Knip applies the same rule to symbols inside a module and runs in full verification.
Its `includeEntryExports` flag stays off: entries such as `@raypx/ui` components and
composable wire schemas exist to be composed by consumers, so an unused-symbol report
on them would be an ignore list rather than a signal.

## Consequences

- A dependency review shows which transport or platform surface a workspace uses.
- Removing a surface is a resolution error at every call site, not a runtime import
  of a barrel that still happens to export the symbol.
- A new entry costs one consumer; a speculative entry has nowhere to live.
- Contracts, API, Control and Relay now list `@raypx/memory` and `@raypx/jobs` as
  workspace dependencies, so their dependency closure includes the UI workspaces
  those packages need for `/client`. No UI module reaches their bundles, because they
  import only `/model` and `/server` and the checks above reject anything else. The
  boundary is held by `policy` rather than by the package graph; removing those checks
  would remove the boundary.
