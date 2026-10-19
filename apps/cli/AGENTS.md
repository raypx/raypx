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
- The executable initializes `@voidmix/logger` once and closes it after runtime shutdown.
  Runtime diagnostics are injected; imports and unit tests never initialize a global logger.
  NDJSON diagnostics use stderr in every mode, including `--json`. Keep command results and
  protocol errors separate. Log only bounded IDs, status, duration and safe error codes;
  never command arguments, working directories, output or raw errors.
  Completion summaries use `elapsedMs` for the operation lifetime; evlog's `durationMs`
  measures only its short-lived logging scope.
- Built-in file operations reject traversal and symlinks. External commands run with ordinary user permissions.
- Deletion requires explicit confirmation. File writes require the current version or null for creation.
- EOF/quit stops scheduling and cancels managed descendants. Missed Cron triggers are skipped.
- Profile databases and locks are local; tests and smoke runs use temporary profiles.
- Vite+ `vp pack` bundles the ESM entry and dependencies; its build hook compiles the
  bundle with the pinned Bun runtime and bytecode into `dist/raypx` (`raypx.exe` on Windows).
  Keep Bun compilation: `pack.exe` uses Node SEA and cannot run the Bun-specific runtime APIs.

## Verification

`tests/smoke.ts` validates the built executable separately from the unit tests.

`bun run --cwd apps/cli check`, `bun run --cwd apps/cli test`, `bun run --cwd apps/cli build`, then `bun run --cwd apps/cli smoke`.
