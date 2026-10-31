# cli

## Purpose

The standalone Raypx local execution host. It runs without login, Node or a global Bun installation.

## Interface

`raypx daemon start|run|status|stop|restart|install|uninstall` owns the macOS and Windows execution host
(`install` is macOS-only); private `daemon proxy` connects Desktop over authenticated IPC:
a Unix socket on POSIX, token-guarded loopback TCP on Windows (`runtime/local-http.ts`, ADR 0037). Explicit
`connectors install|repair|uninstall claude|codex` manages owned terminal hooks.
`raypx files`, `raypx jobs`, `raypx tools`, and private `raypx stdio` share the runtime. On Windows, direct `raypx stdio` still composes the foreground owner; EOF cancels its work. Desktop uses the daemon. `--json` is finite machine output. Desktop bundles a version-matched binary and talks NDJSON over stdio.

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
All stores share `<profile>/profile.sqlite` through private `runtime/sqlite` Drizzle definitions.
`db:generate` generates migrations/snapshots and embeds the journal; never edit generated files.
`check` verifies the embedded journal; migrate uses a separate process lock and rejects unmanaged/unknown schemas. Keep PRAGMA SQL, rowid-preserving REPLACE and bounded native snapshot cursors explicit.

`runtime/process/herdr.ts` delegates PTY/VT/cursor state to pinned Herdr; Desktop stages its verified runtime/DLLs/licenses. Runtime never downloads binaries.
`RAYPX_HERDR_BINARY` selects an absolute development binary. Each owner starts an isolated server: client EOF cancels its PTYs; owner EOF stops its server. Never reuse user sessions.
Commands/environment use a one-use authenticated local handoff, never persisted layouts. Input/resize/paste delivery is bounded and serial; never retry uncertain input.
Default builds/tests need no Herdr/Rust. `smoke:herdr-terminal` is the explicit native gate; `RAYPX_HERDR_COMPILED=1` tests compiled helpers after building.

## Constraints

- Never import another application or authentication code.
- The explicit daemon owns scheduling on macOS and Windows. On Windows a compiled CLI starts it from a
  per-build copy under `<data>/bin` so the Desktop updater can replace the bundled executable.
  Ordinary foreground commands never install a daemon or system service. Desktop may start
  an independent owner on demand; `daemon install` alone registers launchd.
- Child PATH ends with `<profile>/bun` `bun`/`bunx` shims (`BUN_BE_BUN=1`, `runtime.info.bun`); Bun's children inherit it.
- Stdout is protocol-only in stdio mode. Logs go to stderr.
- The executable configures `@raypx/logger` (evlog) once with an explicit field policy and a
  stderr stream drain, and closes it after runtime shutdown.
  Runtime diagnostics are injected; imports and unit tests never initialize a global logger.
  NDJSON diagnostics use stderr in every mode, including `--json`. Keep command results and
  protocol errors separate. Log only bounded IDs, status, duration and safe error codes;
  never command arguments, working directories, output or raw errors.
  Completion summaries use `elapsedMs` for the operation lifetime; evlog's `durationMs`
  measures only its short-lived logging scope.
- Built-in file operations reject traversal and symlinks. External commands run with ordinary user permissions.
- Deletion requires explicit confirmation. File writes require the current version or null for creation.
- Foreground stdio EOF and explicit daemon stop cancel owned descendants. Daemon proxy EOF
  disconnects one client and cancels its tools/PTYs, preserving Agent tasks and scheduling.
  Missed Cron triggers are skipped.
- Profile databases and locks are local; tests and smoke runs use temporary profiles.
- Vite+ `vp pack` bundles the ESM entry and dependencies; its build hook compiles the
  bundle with the pinned Bun runtime and bytecode into `dist/raypx` (`raypx.exe` on Windows).
  Keep Bun compilation: `pack.exe` uses Node SEA and cannot run the Bun-specific runtime APIs.

## Verification

Tests live under `tests/unit/` and `tests/integration/`, then mirror runtime,
commands and TUI. Pure parsers, injected provider ports and SDK loops stay in unit;
filesystem/SQLite, real HTTP, subprocess and daemon boundaries stay in integration.
Agent integration suites separate lifecycle/approvals, inputs and context/resume.
Injected suites separate Pi tool durability and provider gate/drain replay (`tests/helpers/provider-replay.ts`).
Temporary profiles and execution hosts are owned by `tests/helpers/runtime.ts` and
`tests/helpers/agents.ts`; each case still receives a fresh runtime and directory.
`tests/smoke/artifact.ts` validates the built executable separately from the unit tests.
`tests/smoke/tui.ts` owns the explicit PTY smoke gate.
Its Python driver lives in `tests/fixtures/tui/`; simulated Agent executables and
their child processes live in `tests/fixtures/agents/` and run from temporary profiles.
`smoke:tui` is an explicit POSIX PTY gate using system Python 3 for terminal flags,
signals, descendant cleanup and coexistence with a Desktop scheduler. It is not a
runtime dependency or part of the cross-platform default verify gate.

`runtime/terminal` supplies the observed-session RequestBroker, private authenticated
hook endpoint (Unix socket, or loopback on Windows), bounded plain-content envelopes and safe hook settings plans.
`runtime/daemon` owns relay v4, project-specific Away opt-in, host authorization
in Keychain or Windows Credential Manager and connector/service installation.
`runtime/foreground.ts` reuses its control and terminal routing for direct Windows stdio,
with lifecycle shutdown owned by that foreground process. Host credentials never enter JSON
settings or Desktop renderer responses. See docs/development/terminal-host-p1.md.
Hook failure returns no decision, unlike the managed Agent's blocking hook policy.
`connectorCommand` writes exec-form Claude hooks and cmd-quoted Codex hooks on Windows.
`smoke:terminal claude|codex` and `smoke:terminal-stream` require
`RAYPX_LIVE_AGENTS=1`, use isolated synthetic projects, and consume provider usage.
Codex runs in a real PTY; exec's never-approval policy is not a hook acceptance gate.
Reviewed, redacted recordings are under `tests/fixtures/terminal/recorded` and replay
without credentials in the default suite. Never commit the private raw captures.

`eval:agents` previews policy Evals (`--run` enables paid calls); `perf:tasks` checks snapshots. See docs/development/agent-quality.md.

## Agent host

`runtime/memory` owns the context tables in the shared profile database and injects the shared
context-library service. Private `memory.*` IPC needs no account and never migrates
on login/logout. Validate project targets against this device and granted Agent
projects. Immutable history and current documents commit atomically with revision
checks; archived entries remain in the 100-document quota. Local tasks resolve
explicit revisions after receipt lookup, while remote tasks use only command
snapshots. Persist context metadata on follow-ups and inject reference text into
the first provider prompt, rejecting excess total size before launching execution.

`runtime/agents/index.ts` is the local/replay/receipt facade. Its private
`harness/execution.ts` owns each task's turn queue, approvals, cancellation and
project-lock release through process draining. `harness/providers/codex.ts` and
`claude.ts` adapt provider protocols through a narrow process port; they never
own task storage or account/relay transport. Keep protocol callbacks fenced to
the current process. The coordinator uses an explicit persistence subset and
lifecycle effects; do not pass the entire AgentRuntime as an adapter context.

`harness/providers/pi.ts` is a private SDK experiment, not a registered provider.
Callers supply tools, approval, model streaming and a revision-checked context store.
Persist tool intent before execution and result before further inference; never
replay uncertain effects. `smoke:pi` verifies an isolated compiled offline fixture.
Repeated tool IDs are fenced by committed history. Runs accept caller cancellation
and a bounded deadline, then drain active effects before settling. The private
`harness/context/sqlite.ts` store owns validated, size-bounded local contexts with
atomic revision checks. Keep its database and lifecycle caller-owned; reopening
never clears unresolved intents or authorizes replay.

Private `agents.*` methods own external CLI subprocesses, project authorization,
canonical-directory locks, host-owned approvals and a durable SQLite replay journal. The Agent host is lazy so
ordinary local commands never repair or cancel another host's task records. Never
import cloud authentication or expose executable paths through remote contracts.
Commit task status and its outbox event atomically. Release canonical project locks
only after process-tree termination and stream draining complete, including detach.

Relay receipts keep payload/results; local history clearing instead keeps content-free hashes
(same retry: NOT_FOUND; changed payload: IDEMPOTENCY_CONFLICT). Keep acknowledged replay
events; frozen paged snapshots cover journal compaction gaps.
`tasks.input` records a durable instruction before dispatch. Queue runs only after
a successful turn; Codex steer targets the current turn ID, while Claude confirms
interrupt and waits for its result before sending on the same stream. Keep one
turn active and retain the project lock across queued work. Restart never replays
uncertain inference. Conversation projections select text, tool status and usage;
exclude reasoning, child-agent content, tool arguments and stdout. Activity entries
keep stable IDs and increasing revisions; throttle deltas and flush on termination.

`agents.local.*` exposes device-workspace task reads, direct commands, device metadata
and detach through private stdio only. Local tasks use a persistent device identity
and a `desktop:` binding, share the same execution locks and approval arbitration,
and keep status/request journal history without a cloud outbox. Activity lives only in its latest projection. Never include these bindings in
remote snapshots or replay. Local activity survives relay compaction. Local pages, pending
approvals and startup recovery filter in indexed SQL. History survives logout until
`agents.local.clear` removes finished tasks and orphaned receipts atomically, keeping active work/parents and pending creation; device-owned local work survives account changes and stops on engine shutdown. A new local approval adds `pendingRequest`
to `agent.changed` so Desktop can notify; relay approvals notify after delivery.
Use Core's code-point-safe
text clipping and JSON normalization at persistence boundaries. Codex counter resets
replace the baseline and mark the affected turn's usage unknown. A rejected steer
waits in the queue for actual turn completion; it never times out a healthy turn.
The executable smoke writes its evidence to `.artifacts/cli/provider-smoke.json`,
outside the cache-restored compiled `dist` output.

Headless Claude can return a plan without an ExitPlanMode tool. Keep the project
locked, offer the complete plan as a host approval, and resume the same provider
session only after an applied decision. Revision notes stay in plan mode; expiry
and cancellation never start another inference call. An approved hook-based plan
also moves the task to run mode so it is not offered twice.

P1 review hardening: proxy stdout contains complete bounded NDJSON lines only.
Administrative stop accepts only the current IPC protocol, permits a different build, and waits for owner lock
release; explicit restart cancels owned work. Closing rejects new clients. Compiled
build identity also fences same-version upgrades. Connector status validates the
owned executable, repair/update retains ownership and refuses downgrades. Explicit
`[connectors]` paths and Native overrides survive launchd environment differences.
Away policy changes update the existing broker, preserving unaffected waiters and
epoch. Detect managed provider session IDs instead of inheritable environment flags.
`connectors repair <provider>` explicitly backs up a modified, previously owned
regular binary before replacing it. It preserves Agent settings and refuses unknown
ownership, symlinks and downgrades. Invoke from the trusted current executable;
the modified installed program cannot repair itself. Automatic startup never
overwrites modified files.

Local terminal approvals belong to one profile-owned `terminal/` broker, with its
owner lock at profile level and hook discovery at profile root. `approvals.local.*`
and connectors bypass cloud restoration and serial work. Only authenticated client
leases make the local approval channel reachable. Remote eligibility is frozen per
request; independent projection withdrawal revisions never alter broker revisions.
Cloud settings are explicit `host.terminal.*` Native RPCs. See ADR 0035.
Registry/driver interfaces in `agents/harness` own provider construction and bounded
probes; keep plan policy and persistence in ManagedExecution and raw record parsing
in ConversationRecorder. Do not require a ProviderProcess in the lifecycle port.
