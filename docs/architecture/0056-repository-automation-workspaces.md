# ADR 0056: Repository automation workspaces

Date: 2026-11-12

Status: Accepted.

## Context

Repository automation lived in three places. The independently released
`@raypx-kit/devkit` supplied generic discovery, boundary, catalog, artifact, change
scope and VP task mechanics. `@raypx/tooling` combined VP task registration, build
helpers and the whole `raypx-dev` implementation. `@raypx/scripts` only registered
the executable.

Every workspace depended on Tooling to register tasks, so any Tooling edit, including
private validation code, invalidated all type-check caches. Devkit changes required a
Raypx Kit release. The TypeScript presets and runtime-node could not register tasks
through Tooling and kept their own bootstrap scripts. Devkit's `process` entry loaded
dotenvx at module load; every VP configuration load and command paid about 90 ms.

## Decision

Automation is split by how it is consumed:

- `@raypx/task-graph` registers VP tasks: discovery, the Raypx task graph, cache
  inputs and task leaves. Every `vite.config.ts` imports it. It has no internal
  dependencies, so all workspaces, including the presets, register tasks the same way.
- `@raypx/tooling` holds build and acceptance helpers (Nitro options, deployment
  contract, release identity, Start environment, CLI payloads, the Desktop preview
  server and performance runs). Only the applications importing them depend on it.
- `@raypx/dev-cli` implements `raypx-dev`: commands, policy, validation, verification
  planning, CI gates and smoke probes. Devkit's generic checks live privately in its
  `src/repo/`. It has no exports.

Devkit's sources start from `@raypx-kit/devkit@0.0.0-alpha.6` at Raypx Kit commit
`b173f9d9f3e494bb51feb39ebcb9a4ef9a19976d`; the unused `toolchain`, `lint`, `testing`
and Turbo runner were not carried over, and the package no longer exists.

Type checks fingerprint the member and every dependency with package exports. The
verification planner selects only Dev CLI for its policy, validation, verification and
test edits, and only actual importers for Tooling entries.

`developmentEnvironment` reads `.env.local` and `.env` with `node:util` `parseEnv`
instead of dotenvx. Precedence is unchanged (process, then `.env.local`, then `.env`);
values are literal, without `${VAR}` expansion, command substitution or encrypted
values, none of which the repository uses.

## Consequences

Editing Dev CLI's private checks no longer invalidates other workspaces' caches;
editing a Tooling build helper affects only its importers; editing Task Graph affects
every workspace, as task definitions do. `raypx-dev doctor` startup fell from about
140 ms to 60 ms on macOS arm64. The Raypx Kit devkit package is no longer a Raypx
dependency.

## Verification

Policy, knip, each package's checks and tests, the planner scope tests and
`bun run verify` cover the split. CI's production-only Dev CLI install runs `ci:plan`.
