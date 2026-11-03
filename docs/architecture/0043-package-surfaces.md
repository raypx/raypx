# ADR 0043: Package surfaces

Status: Accepted, 2026-11-03. Extends ADR 0042.

## Direction

A package entry is a surface, not a barrel. Each public subpath carries one cohesive
responsibility, and a consumer imports the exact surface it operates on. A root `.`
entry that re-exports unrelated concerns is a compatibility crutch: it hides which
layer a module belongs to and drags the union of every consumer's dependencies into
each one. Packages therefore declare explicit subpaths and no root.

Two rules follow from that and are enforced by Tooling:

- **No mixed roots.** `@raypx/client` no longer offers `.`; it exposes `/api`, `/relay`
  and `/tasks`. `@raypx/tasks` and `@raypx/contracts` drop their roots the same way.
- **Every public entry has a consumer** (finalized with the entry-consumer check; see
  the "Enforcement" section).

## Client

`@raypx/client` splits by transport concern:

- `/api`: `createApiClient` with `ApiClient`, `ApiHeaders`, `FetchCallable` and
  `CreateApiClientOptions`, plus `isMissingProcedure`.
- `/relay`: `RelayConnection`, `relayUrl`, `RelaySocketFactory`, and the scheduler
  vocabulary (`RelayScheduler`, `systemRelayScheduler`) that was previously exported
  from its own module.
- `/tasks`: `createTaskClient` and `TaskClient`.

The root also re-exported contract types — `RelayClientFrame`, `RelayServerFrame`,
`RelayCommand` and `TaskChange`. Those are wire vocabulary, not client API. They now
come from `@raypx/contracts/tasks` directly, which is where they are authored.

Removing the root makes the split self-enforcing: a bare `@raypx/client` import fails
to resolve, so no lint rule is needed to keep consumers on a real surface. The visible
payoff is in the Web bundle — the sign-in chunk no longer contains relay scheduling,
because sign-in imports only `/api`.

## Tasks

`@raypx/tasks` drops `.`. The two pure helpers it held, `isTaskActive` and `taskCursor`,
move to `src/model/task.ts` and export from `/model` alongside the rest of the page
model. Internal views and models import them by relative path; external consumers use
`/model`.

The workspace keeps `/model`, `/client` and its client sub-entries. Domain types that
the root used to re-export (`AgentTask`, `HumanRequest`, `HumanDecision`, `SyncDevice`)
are imported from `@raypx/core/tasks` and `@raypx/contracts/tasks`, their owners.

## Contracts

`@raypx/contracts` drops `.`, `./jobs` and `./memory`. The jobs and memory schemas stay
where they are — `@raypx/jobs` and `@raypx/memory` own them as vertical packages
(`docs/development/workspaces.md`), and `/api` composes them internally. Only the composition surface
is public. A consumer that needs a jobs or memory wire schema imports it from the
owning package, not through contracts.

## Enforcement

- The devkit entry-target checks keep each entry's platform honest.
- `packages/tooling/src/validation/source-layers.ts` gains a `contracts` layer that
  forbids React, UI, i18n, icons, client, host, auth and any `server`/`client`/`crypto`
  subpath transitively from `packages/contracts/src/`, in addition to the
  infrastructure rule (Bun/Node host modules, Drizzle, database and provider packages)
  every layered owner shares.
- A new entry-consumer check in Tooling's `policy()` requires every `exports` key of a
  library or tooling workspace to have an importer in another workspace or in a
  repository-root configuration file. Suites, files under `tests/` and the `e2e`
  workspace count only as test importers, which are enough for `./testing*` entries and
  tooling workspaces but not for a library's production surface. Exceptions are
  declared per workspace as `raypx.entryConsumers` with a reason, so a deliberate
  single-consumer entry documents itself instead of silently rotting.

An entry with no consumer is deleted rather than kept "just in case".

Knip's `includeEntryExports` — the same rule applied to symbols inside an entry — is
not enabled yet. Turning it on for `packages/*` reports 194 unused exports, most of
them component exports from `@raypx/ui` that exist for consumers to compose, plus
wire schemas a package exports for composition. Reducing that list means either
un-exporting genuine API or carrying a large ignore inventory, and neither belongs in
this change. It stays a follow-up: adopt the flag once the remaining list is small
enough to review.

## Entries with no consumer

The check found eighteen entries without a production importer. Fourteen were removed:

- `@raypx/core` (`.`): its subpaths already covered everything the root re-exported.
  The internal barrel went with it; Core's own tests import the owning modules.
- `@raypx/ui` (`.`): an empty `export {}` stub kept only to have a root.
- `ui/styles.css` and `ui/styles/globals.css`: applications import `ui/styles/app.css`.
- `ui/components/ui/toast`: a duplicate explicit key. The module is still reachable
  through the `./components/ui/*` pattern, which this change does not narrow.
- `database/env`, `email/types`, `env/runtime`, `tooling/repository`.
- `i18n/server` and `i18n/testing`: nothing ran them, so the modules and their tests
  were deleted as well. Tooling reads catalogs through `@raypx-kit/intl` directly.
- `logger/context` and `logger/pipeline`: the modules stay internal; the package type
  fixture and unit tests import them by relative path.
- `devtools/snapshot`: only the package's own panel imports it, by relative path.

`ui/toast` stays: Storybook's feedback stories consume it.

Four entries stay by declaration, each with its reason in `raypx.entryConsumers`:

- `i18n/config` is read as a file by Tooling's static catalog reader.
- `devtools/renderer` is injected as a module string into the overlay by the Vite plugin.
- `infra/railway` (`.`) is an IaC program the Railway CLI loads through its preload script.
- `database` (`.`) adds `migrateDatabase` on top of `/connection` for the PostgreSQL
  acceptance harness; production migrates through the package's own `db` commands.

Pruning is not the whole cleanup: removing an entry leaves its module's exports
unused, which Knip reports even without the entry-export flag. Those exports are
trimmed to what the module still provides its remaining consumer.

## Consequences

- Consumers name a surface, so a dependency review shows which transport a workspace
  actually uses.
- Deleting a surface is a compile error at every call site instead of a runtime import
  of a barrel that still happens to export the symbol.
- New entries cost one consumer. A speculative entry has no place to live.
