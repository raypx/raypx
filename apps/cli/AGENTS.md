# cli

## Purpose

The standalone Raypx local execution host. It runs without login, Node or a global Bun installation.

## Interface

`raypx files`, `raypx jobs`, `raypx tools`, and private `raypx stdio` share the runtime. `--json` is finite machine output. Desktop bundles a version-matched binary and talks NDJSON over stdio.

Public commands use an explicit citty tree; `roots` and the existing JSON params remain supported.
Validate global options strictly before dispatch, preserving operands after `--`. Generate scoped
help with `renderUsage`; never use `runMain` or let citty print errors or exit the process.
Raypx owns confirmation, result output, diagnostics and shutdown. Internal RPC additions do not
automatically become public commands.

`raypx tui` is a lazy-loaded, line-oriented task browser with no additional dependencies.
Require both stdin/stdout TTYs and reject `--json`/`--yes`; help stays non-interactive.
It owns a single in-process runtime with `scheduler:false`, uses its request interface,
and closes only its own work on quit/EOF/signals. Restore input state and sanitize display
text; never rewrite persisted output. Cross-owner control and default no-arg TUI remain planned.

## Ownership

Own authorized directory operations, device-local SQLite state, Cron scheduling, external commands and interactive terminals. Shared wire schemas live in `@raypx/contracts/local`.

## Constraints

- Never import another application or authentication code.
- Only the Desktop-owned stdio engine starts scheduling. Foreground CLI commands never install a daemon.
- Stdout is protocol-only in stdio mode. Logs go to stderr.
- The executable configures `@raypx-kit/logger` (evlog) once with an explicit field policy and a
  stderr stream drain, and closes it after runtime shutdown.
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

Tests live under `tests/`, with subdirectories mirroring the runtime, commands and TUI.
Runtime suites are split by files, jobs, process and state under `tests/runtime/`,
with temporary profile creation and cleanup in `tests/helpers/runtime.ts`.
`tests/smoke/artifact.ts` validates the built executable separately from the unit tests.
`tests/smoke/tui.ts` owns the explicit PTY smoke gate.
`smoke:tui` is an explicit POSIX PTY gate using system Python 3 for terminal flags,
signals, descendant cleanup and coexistence with a Desktop scheduler. It is not a
runtime dependency or part of the cross-platform default verify gate.

`bun run --cwd apps/cli check`, `bun run --cwd apps/cli test`, `bun run --cwd apps/cli build`, then `bun run --cwd apps/cli smoke`.
