# cli

## Purpose

The standalone Raypx local execution host. It embeds Bun and requires no global runtime. Execution requires first-time instance enrollment; its signed identity permits offline work after online logout.

## Interface

`raypx daemon start|run|status|stop|restart|install|uninstall` owns the macOS and Windows execution host
(`install` is macOS-only); private `daemon proxy` supports diagnostic/performance probes over authenticated IPC:
a Unix socket on POSIX, token-guarded loopback TCP on Windows (`runtime/local-http.ts`, ADR 0037). Explicit
`connectors install|repair|uninstall claude|codex` manages owned terminal hooks.
`raypx files`, `raypx jobs`, `raypx tools`, and private `raypx stdio` share the runtime. On Windows, direct `raypx stdio` still composes the foreground owner; EOF cancels its work. Desktop uses the daemon. `--json` is finite machine output. Desktop bundles a version-matched binary, bootstraps with finite stdin/JSON and connects its renderer directly to the daemon channel.

`raypx ai providers|models|complete` lazily loads `@raypx/ai` for Pi SDK model calls.
CLI owns `[ai]` in `~/.raypx/config.toml` (`RAYPX_HOME` may select an absolute
directory); it never rewrites the file. JSON params override those non-secret
settings. Keys come only from provider environment variables or `api_key_env`.
Catalog commands are offline and never create a profile database. Completion is
one bounded request; signals abort it and close its client. Keep finite JSON
output, stable LocalError codes, and prompts/credentials/provider errors out of
diagnostics. Returned tool calls remain data for a caller to authorize and execute.

Private `daemon desktop` is a finite, bounded stdin/JSON bootstrap for ADR 0052.
Administrative IPC issues a separate native capability and a one-use renderer
WebSocket capability; neither grants the other's methods. `daemon/desktop` owns
the selected-origin API policy, account verification, encrypted session table and
bounded acknowledged events. Native visibility/pickers use private IPC. Renderer
disconnect cancels HTTP and its approval lease, preserving accepted tools/PTYs and
durable tasks. Desktop execution ownership is native owner + origin + enrolled
identity, registered before startup; only explicit GUI Quit, cancellation, deadline
or daemon stop ends it. Scoped list/result/terminal restore never replay input.
Bootstrap replacement is serialized and preserves the old binding on preparation
failure. Later keys recover temporary sessions; native-confirmed reset clears only
Desktop sessions across origins, preserving Host vault and local data (ADR 0054).
Go holds only the separate native capability; it owns no business HTTP/session/event transport.

Public commands use an explicit citty tree; `roots` and the existing JSON params remain supported.
Validate global options strictly before dispatch, preserving operands after `--`. Generate scoped
help with `renderUsage`; never use `runMain` or let citty print errors or exit the process.
Raypx owns confirmation, result output, diagnostics and shutdown. Internal RPC additions do not
automatically become public commands.

`runtime/owner.ts` is the entry composition for command, TUI, stdio and daemon modes.
Modes determine scheduling and ownership; do not expose independent scheduler/owner
switches at entries. Ordinary commands/TUI own only their foreground work, stdio
retains its platform policy, and daemon owns background scheduling. Services remain
private in runtime/index.ts; shared signal registration belongs to transport/shutdown.ts.

`raypx tui` is a lazy-loaded, line-oriented task browser with no additional dependencies.
Require both stdin/stdout TTYs and reject `--json`/`--yes`; help stays non-interactive.
It owns a single in-process runtime in TUI mode, uses its request interface,
and closes only its own work on quit/EOF/signals. Restore input state and sanitize display
text; never rewrite persisted output. Cross-owner control and default no-arg TUI remain planned.

## Ownership

Own authorized directory operations, device-local SQLite state, Cron scheduling, external commands and interactive terminals. Shared wire schemas live in `@raypx/contracts/local`.
The runtime owns `ProfileStorage` for `<profile>/profile.sqlite` through private `runtime/sqlite` Drizzle definitions. Repositories borrow its writer; they never open, migrate or close it. The profile closes after producers and pending requests drain.
`db:generate` generates migrations/snapshots and embeds the journal; never edit generated files.
`check` verifies the embedded journal; migrate uses a separate process lock and rejects unmanaged/unknown schemas. Keep PRAGMA SQL, rowid-preserving REPLACE and bounded native snapshot cursors explicit.

`runtime/process/herdr.ts` delegates PTY/VT/cursor state to pinned Herdr; Desktop stages its verified runtime/DLLs/licenses. Runtime never downloads binaries.
`terminal.open` may omit the executable: the daemon verifies its absolute `SHELL`/`ComSpec`
or an available system fallback. It never guesses from renderer platform hints or searches PATH;
working directories stay explicit and absolute. `tools.run` still requires an executable.
`RAYPX_HERDR_BINARY` selects an absolute development binary. Each owner starts an isolated server: client EOF cancels its PTYs; owner EOF stops its server. Never reuse user sessions.
On Windows keep the EOF supervisor in an independent process group so abrupt owner termination
still permits cleanup of the default shell and ConPTY descendants.
Commands/environment use a one-use authenticated local handoff, never persisted layouts. Input/resize/paste delivery is bounded and serial; never retry uncertain input.
Default builds/tests need no Herdr/Rust. `smoke:herdr-terminal` is the explicit native gate; `RAYPX_HERDR_COMPILED=1` tests compiled helpers after building.

## Constraints

- Never import another application or authentication code.
- The explicit daemon owns scheduling on macOS and Windows. On Windows a compiled CLI starts it from a
  per-build copy under `<data>/bin` so the Desktop updater can replace the bundled executable.
  Resolve bundled Herdr from the running installation; never export the launcher's directory as an inherited source override.
  Ordinary foreground commands never install a daemon or system service. Desktop may start
  an independent owner on demand; `daemon install` alone registers launchd.
- Child PATH ends with `<profile>/bun` `bun`/`bunx` shims (`BUN_BE_BUN=1`, `runtime.info.bun`); Bun's children inherit it.
  Windows batch files stay ASCII and reach the complete original runtime through a per-path
  directory junction, preserving Unicode paths without changing the console code page.
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
  Missed Cron triggers are skipped. Job history reads and scheduler startup repair abandoned
  runs only under the job lease; storage failures must release execution and scheduler leases.
- Profile databases and locks are local; tests and smoke runs use temporary profiles.
- Formal production packaging (ADR 0047) uses stable Bun 1.4.4: VP builds `src/main.ts` directly with Bun compile, ESM/minify and depth-0 bytecode. Keep the embedded Bun runtime and shims; disabling all bytecode trades little further size for slower startup. One identity is embedded and recorded in `dist/runtime.json`; Desktop, archives, smoke and Strobe share the complete signed payload. `RAYPX_CLI_PAYLOAD` consumers verify and never rebuild.

## Verification

Unit tests live beside runtime, command and TUI source; integration suites stay in
`tests/integration/`, grouped by capability. Tests focused on one source module,
including small temporary filesystem fixtures such as `runtime/process/tools.test.ts`,
stay beside it. Pure parsers, injected provider ports and SDK loops stay in unit;
runtime/profile composition, SQLite, real HTTP, subprocess and daemon boundaries stay in integration.
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
in the borrowed profile SQLite writer and connector/service installation.
`runtime/host.ts` owns host services, request routing, cloud wakeups and shutdown for daemon and Windows foreground transports. The execution-owner factory selects it for direct Windows stdio,
with lifecycle shutdown owned by that foreground process. Host credentials never enter JSON
settings or Desktop renderer responses. See docs/development/terminal-host.md.
Hook failure returns no decision, unlike the managed Agent's blocking hook policy.
`connectorCommand` writes exec-form Claude hooks and cmd-quoted Codex hooks on Windows.
`smoke:terminal claude|codex` and `smoke:terminal-stream` require
`RAYPX_LIVE_AGENTS=1`, use isolated synthetic projects, and consume provider usage.
Codex runs in a real PTY; exec's never-approval policy is not a hook acceptance gate.
Reviewed, redacted recordings are under `tests/fixtures/terminal/recorded` and replay
without credentials in the default suite. Never commit the private raw captures.

`eval:agents` previews policy Evals (`--run` enables paid calls); `perf:tasks` checks snapshots. See docs/development/agent-quality.md.

## Remote transport

Private `runtime/daemon/remote/` is the Bun-only outbound relay transport composed by
`runtime/daemon/control.ts`. Domain schemas live in Core and wire envelopes in contracts.
`RemoteControl` receives `HostAgentPort` explicit operations, never a generic LocalMethod
router, plus injected credential renewal, notifications and optional observed-session
projection/acknowledgement callbacks. CLI supplies policy-filtered remote projections;
the transport has no provider-name policy, never imports browser authentication or
provider credentials, and forwards frozen task reference snapshots without resolving
device library entries. Announcements omit Pi from project grants and advertise its
capability as unsupported; local discovery stays independent. `readRemoteControlSettings`
is pure: it never creates directories, IDs, files, controllers or network activity.
Validate origins with `serverOrigin`; keep secrets out of disk settings and diagnostics.

Always authenticate with relay protocol 4, including after grant renewal or explicit
restart; unsupported handshakes stop with UPGRADE_REQUIRED. Keep replay, command receipts,
connection fencing and bounded renewal/backoff. Terminal renewal failures call the owner's
authorization-loss handler, which owns binding cleanup. Consume background promise failures
and fence queued cleanup to its original binding. Only explicit detach cancels execution;
a daemon client's disconnect is not detach. Server sync requests use `resume.syncId`:
never reset the cursor, reconnect or detach for them. Queue each distinct ID through the
current flush, carry it on every snapshot page and remove it only after its snapshot ACK;
a request arriving during another snapshot keeps its own authoritative checkpoint.

`daemon/acknowledged-stream.ts` owns exact cursor ACK, committed progress, cancellable
deadline and reset for both managed replay and observed projections. The Relay
socket supplies a fresh AbortSignal on every handshake; pending reads and ACK waits
release on disconnect even if an adapter ignores cancellation. Account selection
and Host binding have separate scopes. Pass signals through admission, but never
cancel accepted persistent Agent execution because a transport closed. No lifecycle
generation counters or parallel ACK implementations belong in these channels.

`remote/scheduler.test.ts` uses injected sockets and the client's manual scheduler for
exact retry, renewal-drain and acknowledgement deadlines; RemoteControl forwards one
scheduler to RelayConnection so clocks, jitter and timers share one source. Loopback suites
in `tests/integration/runtime/daemon/remote/` cover real authentication, command delivery,
renewal, replay and snapshots; `tests/helpers/remote-control.ts` owns a fresh loopback relay
and temporary state per case.
Snapshot suites stay in `tests/integration/runtime/agents/`: they exercise real SQLite queries, WAL transactions and runtime pagination. `tests/helpers/agent-snapshot.ts` owns their shared fixtures; pure domain tests stay beside source.

## Agent host

`runtime/memory` owns the context tables in the shared profile database and injects the shared
context-library service. Private `memory.*` IPC needs a registered instance but no active online session and never migrates
on login/logout. Validate project targets against this device and granted Agent
projects. Immutable history and current documents commit atomically with revision
checks; archived entries remain in the 100-document quota. Local tasks resolve
explicit revisions after receipt lookup, while remote tasks use only command
snapshots. Persist context metadata on follow-ups and inject reference text into
the first provider prompt, rejecting excess total size before launching execution.

`runtime/agents/index.ts` is the local/replay/receipt facade. `harness/execution.ts`
owns each task's turn queue, approvals, cancellation and lock release through
process draining. The `@raypx/providers/codex` and `@raypx/providers/claude` entries translate provider protocols
into lifecycle events without owning task storage or relay transport.
`harness/transport.ts` defines protocol I/O; its process implementation is
`runtime/agents/transport.ts`. Fence callbacks to the current execution handle.
The private harness ports declare synchronous command submission, conversation
recording, provider ingestion and lifecycle effects independently of AgentStore and
ConversationRecorder. The outer implementations satisfy those ports; the record
schemas and draft types live in `agents/domain/state.ts` (re-exported by
agents/model.ts). Never derive harness ports from concrete classes or pass the full
runtime. SDK conformance uses in-memory persistence and recording ports.

Orchestration is event-sourced (ADR 0044). Private `agents/domain/` holds the zod
events, commands, `decide(state, command, facts)`, the pure projector, `fold` and
the `wire.ts` projection to today's `AgentEvent`s; it may import only
`@raypx/core/*`, zod and its own files (the `orchestration-domain` source layer).
`infrastructure/store/sink.ts` commits the receipt, events, task/request/activity
projections, relay journal/outbox and effect intents in one synchronous SQLite
transaction, which stands in for a per-task lock. `AgentStore.submit` decides and
commits; AgentCommandService and `AgentRuntime.command` are thin shells over it.
`application/ingest.ts` is the only writer for provider and recorder reports; the
harness keeps the turn queue and handle fencing. Inject `Clock`/`Ids` from
`domain/ports.ts`; never call `new Date()` or `crypto.randomUUID()` inline.
Apply a decision (`request.applied`) before the worker answers the provider.
Effects (`execution.start|cancel`, `provider.request.respond|input.deliver`) are
process-bound and never retried: startup marks open ones `abandoned` before
interrupting active tasks with HOST_RESTARTED. `task_events` stores every
non-activity event; activity stays a latest-value projection. The goldens in
`tests/integration/runtime/agents/orchestration.test.ts` pin the wire sequence;
regenerate them only for a deliberate wire change (`ORCHESTRATION_GOLDENS=write`).

Managed Pi uses `@raypx/providers/pi`; private `runtime/agents/pi` owns its
granted file/command bridge, model admission and context ownership. Local models use
read-only user TOML/environment and profile defaults. Context CAS, revision-bound
cross-connection consent, durable effects and SDK drain apply before continuation.
`raypx tasks` controls daemon-owned Agent tasks and explicit approvals through authenticated IPC;
client exit preserves tasks. The Jobs-only TUI retains its existing ownership.
See ADR 0041 for command examples, limits and local-only Pi scope.

Private `agents.*` methods own external CLI subprocesses, project authorization,
canonical-directory locks, host-owned approvals and a durable SQLite replay journal. The Agent host is lazy so
ordinary local commands never repair or cancel another host's task records. Never
import cloud authentication or expose executable paths through remote contracts.
Commit task status and its outbox event atomically. Release canonical project locks
only after process-tree termination and stream draining complete, including detach.
Cancellation waits only for the targeted task; detach waits only for its binding's
executions. Daemon shutdown drains every execution, including those already stopping.

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
and detach through private stdio only. Task inspection derives `runStatus` from the
persisted task and its pending/decided request kind; missing or mixed wait kinds fail
with `INVALID_AGENT_RUN_PROJECTION`. Never persist a second Run lifecycle record.
Local tasks use a persistent device identity
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
Registry interfaces own adapter construction and bounded probes. Execution owns
plan policy and persistence; provider adapters parse raw conversation records through
the shared ConversationSink interface. ConversationRecorder owns bounded activity
aggregation, revisions and persistence callbacks. Lifecycle
code sees execution handles and adapter events, never transport controls.

## Instance enrollment

`raypx login` uses `RAYPX_API_URL` (default `https://raypx.com`) and an expiring browser-approved code; `RAYPX_WEB_URL` selects a separate account-page origin. The polling token never leaves the host. `runtime/instances` verifies signed receipts and key possession before local execution; direct Agent starts and scheduled jobs enforce the same gate. Refresh at startup and every five minutes; transport failures preserve the offline identity, successful revocation cancels and drains work. Remote Host grants remain separate. Enrollment diagnostics expose only bounded phase names and safe error codes, never key material, codes or host tokens. Instance private keys and origin/account/device/epoch-bound Host authorizations use the existing profile SQLite writer. POSIX storage is 0700/0600; Windows uses restricted inheritable DACLs. Online logout and history clearing retain the instance key. Repositories never open, migrate or close the borrowed connection. Old profiles missing a database key remain unavailable; never read/import old credentials or generate a replacement identity. Receipts contain public identity only. Never auto-import or rebind a profile.

AgentCommandService and AgentQueries own use cases and reads. ExecutionCoordinator is the only active execution owner. ProviderRegistry receives drivers; concrete adapters, approval HTTP and OS locks live in infrastructure. `agents/store.ts` is the AgentStore facade over the orchestration sink; each SQLite family (tasks, activity, requests, command receipts, event journal, task events, effects, snapshot, clear) lives in `agents/infrastructure/store/`. runtime/router.ts owns local method dispatch. Memory receives project validation, not AgentRuntime.
