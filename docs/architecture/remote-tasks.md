# Remote Agent relay and replay

Web and Desktop connect to an authenticated WebSocket relay. On macOS the independent
CLI daemon is the execution authority; Desktop is its private IPC client. Windows
retains the foreground bundled CLI. The owner creates tasks, owns Agent sessions,
resolves approvals and decides final status. API stores account-scoped read projections and
routes commands; a server clock cannot declare a local execution finished.

## Communication

Web / Desktop UI ↔ API relay ↔ CLI daemon ↔ Claude Code / Codex (macOS).
Desktop native ↔ private daemon proxy for local views; Windows keeps native ↔ stdio.
All remote connections are outbound HTTPS/WSS. Native exposes no public port.
The local engine uses version-matched NDJSON over stdio. Codex uses its local
stdio app-server; Claude uses persistent stream-JSON input/output and authenticated session hooks on
loopback. Provider wire messages and credentials remain on the computer.

HTTP RPC serves account/device management, task/request projections and one-time
viewer tickets. Remote task creation, in-flight instructions, follow-up, cancellation and approval decisions travel
through the relay. Visible pages subscribe to change events and refresh projections;
hidden pages suspend those subscriptions. There is no two-second task polling loop.
The execution owner wakes on local engine events, retains the connection when the window hides or macOS GUI quits,
and sends heartbeats to detect broken connections. Reconnect uses bounded backoff.

## Desktop local tasks

Desktop opens This computer by default. Its renderer calls Native and the bundled
CLI through private `agents.local.*` stdio methods for creation, reads, approvals,
follow-ups and cancellation. Local execution requires an authorized project and
an installed provider; it does not require remote access, a relay grant or a Web
deployment or Raypx login. Remote views and host authorization require a confirmed
account session. Local pages remain usable during session errors. Email verification
and password reset still use their existing Web callbacks.

New local tasks use the reserved device-profile `LOCAL_WORKSPACE_ID`, a `desktop:`
binding and a stable local device ID. Native does not prefix this owner by server.
Legacy account-owned tasks retain their deployment/account namespace and are available
only through an explicit signed-in history source; no automatic migration or upload occurs.
Their tasks, answers and event journal stay in SQLite. They never enter the cloud
outbox, including after remote access is enabled, and remote snapshots/replay cannot
read them. The same CLI execution host owns process locks, session continuation,
idempotency and first-answer approval arbitration for both transports. Native change
events refresh local views without network polling. Login/account switches/logout leave
device work running. Logout cancels remote and legacy account work while preserving history;
a host restart marks uncertain runs interrupted.
Local activity is durable and exempt from relay journal compaction. Task lists use
creation-time/ID cursors with newer/older navigation, including when a response's
byte budget produces a short page.

Connected computers retains the remote task flow and account-scoped projections.
Agent settings authorizes local projects independently of login and the remote toggle.
The setup guide authorizes one project, checks installed providers and opens an editor
without starting work. Desktop autosaves a bounded editor slot alongside named drafts.
Device slots retain the same owner across accounts; legacy/remote slots remain scoped
by server/account. WebView partitions still isolate browser storage between deployments.

## Authentication and routing

The account session bootstraps a restricted macOS host credential stored in Keychain.
The daemon uses it to renew device grants valid for at most ten minutes independently
of browser sessions. Native never exports this credential to the renderer. Windows
continues cookie-backed Native renewal. Renewing the same binding reconnects without
cancelling execution. See [P1 host authorization](../development/terminal-host-p1.md). Browser viewers
receive single-use tickets valid for thirty seconds. Authentication is the first
WebSocket frame; tokens are never query parameters. The account query parameter
selects a room and grants no access. Known browser origins are checked at upgrade.

Every relay message revalidates its actor and parent browser session or restricted
host credential. Device epochs fence
revoked connections; connection identities fence stale sockets. A revoke closes
connected devices, whose execution owner cancels the binding. Heartbeats also detect
session revocation and credential expiry. Account changes, logout, disabling remote
access cancel affected managed tasks; transient network loss does not. macOS GUI
Quit preserves tasks, while explicit daemon stop and Windows GUI Quit cancel them.

Node uses Nitro's WebSocket adapter and one relay process. Its first release
requires a single API instance for relay connections. Cloudflare uses one Durable
Object per account, so connections on separate Worker instances share routing.
`exports.cloudflare.ts` exports `RelayRoom`, and Wrangler declares its binding and
migration. This release uses the standard Durable Object WebSocket API; connected
rooms incur duration charges. Hibernation is not implemented.

## Commands and host authority

The relay sends a command only to a connected, synchronized device. It does not
queue offline execution. Browser mutations have bounded deadlines. Desktop records
an immutable command identity and payload before executing, then retains the
result for retries. A lost response can be retried with the same ID; changing its
payload produces an idempotency conflict. Replaying an accepted command cannot
spawn another Agent. After a host restart, uncertain local tasks become interrupted
and are never automatically rerun.

The host validates project authorization, provider availability, the original
session for follow-ups and current request deadlines. The first valid approval
wins locally, including competing answers from several viewers. Project locks use
canonical paths and remain held through process-tree cleanup and stream draining.
Different projects can run concurrently. Execution uses the current directory and
preserves existing changes; Raypx does not automatically stash, reset, commit,
merge or push.

## Event replay and snapshots

CLI atomically commits task status and its event into SQLite. A persistent stream
ID and increasing sequence numbers survive process restart. The outbox is
checkpointed only after API acknowledges durable projection updates. A retained
journal keeps at most 4,096 events and 8 MiB per remote binding, including acknowledged events,
so reconnect can continue after the server's cursor without re-executing commands.

When a cursor falls behind journal retention, the owner sends a frozen, paged snapshot
and continues with events after its watermark. The snapshot contains recent tasks,
all active tasks and their request states. Its pages describe the same captured
state even while live execution advances. API acknowledges only the complete
snapshot. Interrupted snapshot transfers restart safely. Viewer reconnects replay
available cloud events after their cursor; a reset instructs the UI to refresh its
read projection when a complete event range is unavailable.

JSONB comparisons canonicalize object keys when checking event identity. Retried
events are deduplicated, while conflicting content for the same event ID fails.
Stale connections cannot overwrite a newer host connection's projections.

## Conversations and in-flight instructions

Managed Claude and Codex tasks expose a normalized conversation: assistant text,
tool names and outcomes, per-turn token usage, and user instruction receipts.
The host throttles streaming text updates and retains the latest revision of each
entry in SQLite. Local history remains local. API replaces remote activity read
projections by entry ID/revision instead of storing a full transcript copy for
every delta. Reads page up to 64 entries / 192 KiB; each message is capped at
32,000 characters with an explicit truncation notice. Older messages are loaded
on demand. Raw tool output, child-agent output and internal reasoning are excluded.

`tasks.input` uses its instruction UUID as its immutable command ID. Queue holds
up to 20 pending instructions on the executor, then starts each in the same session
after the current turn succeeds. It retains the project lock across those turns.
Codex Send now uses `turn/steer` with the active turn ID. Claude Send now confirms
an interrupt through its control protocol, waits for the interrupted result, then
sends the instruction on the existing stream. These semantics are explained in
the composer. Pending approval blocks Send now, while Queue remains available.
Errors do not automatically run queued work. Cancellation discards unsent work;
restart marks uncertain delivery interrupted and never replays inference.

The shared shadcn interface renders safe Markdown without raw HTML or remote
images. Recognized Claude Edit/Write/MultiEdit inputs and Codex file-change patches
have a Diff view alongside the complete original request. Previews show at most
20 files / 1,200 lines per file and disclose limits. Replacement snippets use
snippet-relative line numbers, not invented file locations. Unknown operations
retain their original text approval. Token counts cover loaded turns only; Raypx
does not infer a bill from them. Older hosts omit input capabilities and show an
upgrade hint instead of nonfunctional controls.

## Data and limits

For remote tasks, cloud receives prompts, status, requests, plans, bounded visible
conversation entries and result summaries. Project files, raw provider transcripts,
terminal streams and Agent credentials remain local. Agent Markdown never executes HTML.
Diagnostics exclude tokens, prompts, bodies,
paths and results. Relay frames are bounded to 1 MiB, batches to 50 events and
assembled snapshots to 32 MiB. Slow connections are disconnected and recover by
cursor. Unsupported or oversized managed-task approvals fail closed. External
terminal hooks instead return to the Agent's native permission flow.

The normalized relay protocol leaves space for another local adapter such as Pi.
Pi Agent execution, arbitrary terminal transcript synchronization and full terminal
control are not part of this release. Explicitly installed macOS Claude/Codex Bash
hooks are covered separately below.

## Verification

The default gate covers real loopback WebSockets, account isolation, one-time
tickets, reconnect/replay, event deduplication, snapshots, revocation, competing
host approvals and protocol subprocess fixtures. `bun run verify` also builds
Node/Worker artifacts and checks relocated outputs.

`bun run test postgres` checks real migrations and projection persistence across
API instances. `bun run test postgres:cloudflare` checks workerd WebSockets with
Durable Objects against both direct PostgreSQL and Hyperdrive. These commands
require an explicit isolated `*_test` database; never use an operator database.

The browser relay gate uses `apps/api/tests/helpers/control-server.ts`, an isolated
database, `CONTROL_E2E_API_URL`, and Web/Desktop builds pointing `VITE_API_URL` at
that fixture. Starting the fixture requires server-only `RAYPX_VALIDATION=1`;
it does not use `NODE_ENV` as its authorization switch. It drives real login and
two renderers with a simulated device.
Native transport tests and CLI subprocess fixtures cover their boundaries
separately. Packaged native GUI behavior, hidden-window credential renewal,
notifications, Windows process cleanup and live provider inference still require
explicit platform acceptance; browser tests do not imply those checks passed.

## Managed activity compatibility and read isolation

Auth and ready negotiate version 2 or 3; v3 adds observed requests while retaining
the managed activity format introduced in v2. Messages begin with a full
activity checkpoint, then carry append-only deltas with base/new revisions;
replacements and terminal updates are full checkpoints. A missing base requires
snapshot recovery. Outbox rows reference journal events rather than copy text.
Local activity updates only its normalized SQLite projection and never enters the
journal. Content that has reached its display bound stops generating unchanged writes.

API read transactions are repeatable-read, read-only and never acquire the
account decision lock. Task activity/event/request queries filter by user/task
and cursor in SQL, supported by expression indexes. Write decisions still use
the account lock. Cloud activity retains its latest revision indefinitely; only
bounded replay/obsolete stream records and orphan projections are reclaimed.
An absent task in a partial snapshot is never evidence that its history was deleted.

Typed change notifications patch the open conversation. Activity-only updates do
not invalidate workspace/device/approval lists. Incomplete snapshots and gaps
after suspension are labelled; contiguous history can be loaded deliberately.

## Observed terminal sessions

macOS relay v3 also synchronizes explicitly opted-in Claude/Codex Bash permission
hooks through a separate RequestBroker and observed projection. Away waiting is
bounded and fails back to the terminal. Tool outputs and full terminal streams
remain local. Content is plaintext private testing data, pending E2EE. See the
[P1 guide](../development/terminal-host-p1.md) for capability, lifetime and test limits.
