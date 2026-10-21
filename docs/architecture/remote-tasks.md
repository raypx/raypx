# Remote Agent relay and replay

Web and Desktop connect to an authenticated WebSocket relay. Desktop is the
execution authority: its bundled CLI creates tasks, owns Agent sessions, resolves
approvals and decides final status. API stores account-scoped read projections and
routes commands; a server clock cannot declare a local execution finished.

## Communication

Web / Desktop UI ↔ API relay ↔ Desktop native ↔ bundled CLI ↔ Claude Code / Codex.
All remote connections are outbound HTTPS/WSS. Native exposes no public port.
The local engine uses version-matched NDJSON over stdio. Codex uses its local
stdio app-server; Claude uses print-mode JSON and authenticated session hooks on
loopback. Provider wire messages and credentials remain on the computer.

HTTP RPC serves account/device management, task/request projections and one-time
viewer tickets. Remote task creation, follow-up, cancellation and approval decisions travel
through the relay. Visible pages subscribe to change events and refresh projections;
hidden pages suspend those subscriptions. There is no two-second task polling loop.
Native wakes on local engine events, retains the connection when the window hides,
and sends heartbeats to detect broken connections. Reconnect uses bounded backoff.

## Desktop local tasks

Desktop opens This computer by default. Its renderer calls Native and the bundled
CLI through private `agents.local.*` stdio methods for creation, reads, approvals,
follow-ups and cancellation. Local execution requires an authorized project and
an installed provider; it does not require remote access, a relay grant or a Web
deployment. The account login gate is retained, so this is not an anonymous or
fully offline sign-in mode. Email verification and password reset still use their
existing Web callbacks.

Local tasks have an account-scoped `desktop:` binding and a stable local device ID.
Their tasks, answers and event journal stay in SQLite. They never enter the cloud
outbox, including after remote access is enabled, and remote snapshots/replay cannot
read them. The same CLI execution host owns process locks, session continuation,
idempotency and first-answer approval arbitration for both transports. Native change
events refresh local views without network polling. Logout/account changes cancel
local work while preserving its history, and a restart marks uncertain runs interrupted.
Local activity is durable and exempt from relay journal compaction. Task lists use
creation-time/ID cursors with newer/older navigation, including when a response's
byte budget produces a short page.

Connected computers retains the remote task flow and account-scoped projections.
Agent settings authorizes local projects independently of the remote access toggle.

## Authentication and routing

The account session issues a device grant valid for at most ten minutes. Native
keeps it only in memory. WebView renews grants through the existing account session;
renewing the same binding reconnects without cancelling execution. Browser viewers
receive single-use tickets valid for thirty seconds. Authentication is the first
WebSocket frame; tokens are never query parameters. The account query parameter
selects a room and grants no access. Known browser origins are checked at upgrade.

Every relay message revalidates its actor and parent session. Device epochs fence
revoked connections; connection identities fence stale sockets. A revoke closes
connected devices, whose native host cancels the binding. Heartbeats also detect
session revocation and credential expiry. Account changes, logout, disabling remote
access and Quit cancel managed tasks; transient network loss does not.

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
journal keeps the latest 4,096 events per remote binding, including acknowledged events,
so reconnect can continue after the server's cursor without re-executing commands.

When a cursor falls behind journal retention, native sends a frozen, paged snapshot
and continues with events after its watermark. The snapshot contains recent tasks,
all active tasks and their request states. Its pages describe the same captured
state even while live execution advances. API acknowledges only the complete
snapshot. Interrupted snapshot transfers restart safely. Viewer reconnects replay
available cloud events after their cursor; a reset instructs the UI to refresh its
read projection when a complete event range is unavailable.

JSONB comparisons canonicalize object keys when checking event identity. Retried
events are deduplicated, while conflicting content for the same event ID fails.
Stale connections cannot overwrite a newer host connection's projections.

## Data and limits

For remote tasks, cloud receives prompts, status, requests, plans and result summaries. Project
files, full provider transcripts, terminal streams and Agent credentials remain
local. Agent text renders as text. Diagnostics exclude tokens, prompts, bodies,
paths and results. Relay frames are bounded to 1 MiB, batches to 50 events and
assembled snapshots to 32 MiB. Slow connections are disconnected and recover by
cursor. Unsupported or oversized approvals fail closed.

The normalized relay protocol leaves space for another local adapter such as Pi.
Pi, existing arbitrary terminal sessions and full terminal control are not part of
this release.

## Verification

The default gate covers real loopback WebSockets, account isolation, one-time
tickets, reconnect/replay, event deduplication, snapshots, revocation, competing
host approvals and protocol subprocess fixtures. `bun run verify` also builds
Node/Worker artifacts and checks relocated outputs.

`bun run test:postgres` checks real migrations and projection persistence across
API instances. `bun run test:cloudflare:postgres` checks workerd WebSockets with
Durable Objects against both direct PostgreSQL and Hyperdrive. These commands
require an explicit isolated `*_test` database; never use an operator database.

The browser relay gate uses `apps/api/tests/helpers/control-server.ts`, an isolated
database, `CONTROL_E2E_API_URL`, and Web/Desktop builds pointing `VITE_API_URL` at
that fixture. It drives real login and two renderers with a simulated device.
Native transport tests and CLI subprocess fixtures cover their boundaries
separately. Packaged native GUI behavior, hidden-window credential renewal,
notifications, Windows process cleanup and live provider inference still require
explicit platform acceptance; browser tests do not imply those checks passed.
