# ADR 0056: In-repository devkit

Date: 2026-11-12

Status: Accepted.

Superseded by [ADR 0057](0057-repository-automation-workspaces.md).

## Context

The independently released `@raypx-kit/devkit` supplied workspace discovery,
boundary checks, static catalog reading, document links, artifact probes, Git
change scopes and the VP task helpers. Tooling, the TypeScript presets and
runtime-node imported it, so every change to repository mechanics required a Raypx
Kit release and a catalog update. Raypx used nine of its twelve entries.

The published `process` entry imported `@dotenvx/dotenvx` at module load. `tasks`
depends on `process`, and every workspace `vite.config.ts` loads `tasks` through
`@raypx/tooling/tasks`, so each `raypx-dev` command and VP configuration load paid
about 90 ms before doing any work.

## Decision

`@raypx/devkit` is a private source workspace in `packages/devkit`, starting from
the release `@raypx-kit/devkit@0.0.0-alpha.6` at Raypx Kit commit
`b173f9d9f3e494bb51feb39ebcb9a4ef9a19976d`. It keeps the nine consumed entries;
`toolchain`, `lint`, `testing` and the unused Turbo runner are not carried over.

It is the bottom of the workspace graph and has no internal dependencies: its
tsconfig inlines the strict preset and its tasks register through its own
`scripts/task.ts`, like the TypeScript presets and runtime-node.

`developmentEnvironment` reads `.env.local` and `.env` with `node:util` `parseEnv`
instead of dotenvx. Precedence is unchanged (process, then `.env.local`, then
`.env`); values are literal, without `${VAR}` expansion, command substitution or
encrypted values, none of which the repository uses.

## Consequences

Repository mechanics change and are verified in one commit. `raypx-dev doctor`
startup fell from about 140 ms to 60 ms on macOS arm64. The Raypx Kit package is no
longer a Raypx dependency; its future is decided in that repository.

## Verification

Devkit tests cover dotenv precedence and literal parsing. Policy, knip, Tooling
tests and `bun run verify` run against the local workspace.
