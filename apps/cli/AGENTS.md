# cli

## Purpose

The standalone Raypx local execution host. It runs without login, Node or a global Bun installation.

## Interface

`raypx files`, `raypx jobs`, `raypx tools`, and private `raypx stdio` share the runtime. `--json` is finite machine output. Desktop bundles a version-matched binary and talks NDJSON over stdio.

`raypx ai providers|models|complete` lazily loads `@raypx/ai` for Pi SDK model calls.
CLI owns `[ai]` in `~/.raypx/config.toml` (`RAYPX_HOME` may select an absolute
directory); it never rewrites the file. JSON params override those non-secret
settings. Keys come only from provider environment variables or `api_key_env`.
Catalog commands are offline and never create a profile database. Completion is
one bounded request; signals abort it and close its client. Keep finite JSON
output, stable LocalError codes, and prompts/credentials/provider errors out of
diagnostics. Returned tool calls remain data for a caller to authorize and execute.

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
Its Python driver lives in `tests/fixtures/tui/`; simulated Agent executables and
their child processes live in `tests/fixtures/agents/` and run from temporary profiles.
`smoke:tui` is an explicit POSIX PTY gate using system Python 3 for terminal flags,
signals, descendant cleanup and coexistence with a Desktop scheduler. It is not a
runtime dependency or part of the cross-platform default verify gate.

`bun run --cwd apps/cli check`, `bun run --cwd apps/cli test`, `bun run --cwd apps/cli build`, then `bun run --cwd apps/cli smoke`.

## Agent host

Private `agents.*` methods own external CLI subprocesses, project authorization,
canonical-directory locks, host-owned approvals and a durable SQLite replay journal. The Agent host is lazy so
ordinary local commands never repair or cancel another host's task records. Never
import cloud authentication or expose executable paths through remote contracts.
Commit task status and its outbox event atomically. Release canonical project locks
only after process-tree termination and stream draining complete, including detach.

Relay command receipts retain their original payload and result. Keep acknowledged
events for cursor replay; a frozen paged snapshot covers journal compaction gaps.
`tasks.input` records a durable instruction before dispatch. Queue runs only after
a successful turn; Codex steer targets the current turn ID, while Claude confirms
interrupt and waits for its result before sending on the same stream. Keep one
turn active and retain the project lock across queued work. Restart never replays
uncertain inference. Conversation projections select text, tool status and usage;
exclude reasoning, child-agent content, tool arguments and stdout. Activity entries
keep stable IDs and increasing revisions; throttle deltas and flush on termination.

`agents.local.*` exposes account-scoped task reads, direct commands, device metadata
and detach through private stdio only. Local tasks use a persistent device identity
and a `desktop:` binding, share the same execution locks and approval arbitration,
and write journal history without a cloud outbox. Never include these bindings in
remote snapshots or replay. Local activity is durable and exempt from relay journal
compaction; indexed task cursors paginate it. History survives logout until
`agents.local.clear` removes finished tasks; active local work is cancelled
on account change or engine shutdown. A new local approval adds `pendingRequest`
to `agent.changed` so Desktop can notify; relay approvals notify after delivery.

Headless Claude can return a plan without an ExitPlanMode tool. Keep the project
locked, offer the complete plan as a host approval, and resume the same provider
session only after an applied decision. Revision notes stay in plan mode; expiry
and cancellation never start another inference call. An approved hook-based plan
also moves the task to run mode so it is not offered twice.
