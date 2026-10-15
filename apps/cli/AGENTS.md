# cli

## Purpose

The standalone Raypx local execution host. It runs without login, Node or a global Bun installation.

## Interface

`raypx files`, `raypx jobs`, `raypx tools`, and private `raypx stdio` share the runtime. `--json` is finite machine output. Desktop bundles a version-matched binary and talks NDJSON over stdio.

## Ownership

Own authorized directory operations, device-local SQLite state, Cron scheduling, external commands and interactive terminals. Shared wire schemas live in `@raypx/contracts/local`.

## Constraints

- Never import another application or authentication code.
- Only the Desktop-owned stdio engine starts scheduling. Foreground CLI commands never install a daemon.
- Stdout is protocol-only in stdio mode. Logs go to stderr.
- Built-in file operations reject traversal and symlinks. External commands run with ordinary user permissions.
- Deletion requires explicit confirmation. File writes require the current version or null for creation.
- EOF/quit stops scheduling and cancels managed descendants. Missed Cron triggers are skipped.
- Profile databases and locks are local; tests and smoke runs use temporary profiles.

## Verification

`bun run --cwd apps/cli check`, `bun run --cwd apps/cli test`, `bun run --cwd apps/cli build`, then `bun run --cwd apps/cli smoke`.
