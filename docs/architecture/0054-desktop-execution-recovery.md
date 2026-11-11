# ADR 0054: Desktop execution ownership and session recovery

Date: 2026-11-11

Status: Accepted; supersedes the execution lifetime and session recovery clauses of [ADR 0052](0052-daemon-desktop-channel.md).

## Context

Renderer event overflow, missed ACKs and native binding expiry are transport
failures. Cancelling accepted terminals and tools on those paths turns a temporary
UI outage into lost work. A session key unavailable during startup must also be
recoverable without restarting the daemon or discarding encrypted sessions.

## Decision

The daemon registers Desktop executions before process startup under a native
owner, canonical server origin and enrolled instance/account identity. Only
authenticated administrative IPC supplies the owner; renderer inputs cannot
select it. Admission and response waiting follow the connection signal, while
accepted execution follows explicit cancellation, its execution deadline, GUI
Quit or daemon shutdown. Disconnect, overflow, ACK timeout, binding expiry and
bootstrap replacement release HTTP requests and approval leases but preserve
accepted executions. Origin changes retain isolated executions; returning to the
original scope restores control. GUI Quit releases that native owner's executions
across origins, including through administrative IPC after its capability expires.
Accepted Agent tasks retain their existing durable lifecycle.

The renderer has three narrow scoped queries: `execution_list`,
`execution_result` and `terminal_restore`. Every query, input and cancellation
checks ownership. Process events go only to the owning native owner and origin.
Completed execution results retain at most 64 entries and 8 MiB; an evicted result
returns an explicit unavailable error. Terminal restoration reads Herdr's current
screen and at most 1,000 history lines / 4 MiB. The renderer retains terminal IDs
and disables input during outages, restores on readiness, and offers existing
terminals after page reload. It never retries terminal input or execution commands.
Daemon restart does not recreate processes.

Bootstrap operations are serialized. Runtime, input and session checks precede
binding replacement; failed candidates do not retire the working channel. Go
retains its previous client until it validates the new descriptor. Engine restart
performs bootstrap even while native status is ready. Native request contexts
allow 30 seconds for root registration, four seconds for control and two seconds
for Quit release. Cancellation, deadlines and bounded business errors do not mark
the host unavailable; transport failure or a refused capability does. Writes are
not automatically retried.

Every bootstrap can attach a newly available native session key. Unchanged
temporary sessions restore saved cookies; a temporary login or logout takes
precedence over the old row after successful decryption. Wrong keys preserve
ciphertext. A corrupt account selection suspends cloud authority and goes through
normal account selection repair without blocking local readiness or restoring an
old cloud binding. Idle persisted origin APIs are evicted when unreferenced;
memory-only sessions remain until persistence recovery, logout or daemon exit.
Peer and concurrent request limits remain independent of origin history.

Settings exposes a repeatable native recovery dialog: retry, reset or cancel.
Reset requires a second native confirmation explaining that every origin's saved
login in the current profile is cleared. Native first saves a new OS key; then
the daemon transaction deletes only `desktop_sessions`, clears API caches and
bootstraps again. Any failed step reports failure. Device enrollment, projects,
tasks, preferences and the independent Host vault are preserved. Historical Go
stores and key namespaces remain untouched. Host authorization exchanges a grant
before vault publication, consumes pending writes and restores or removes only
the attempted credential on failure; failed binding publication is cleaned up.

Daemon event fan-out encodes each event once. NDJSON reuses that payload; each
WebSocket queue retains its final envelope and exact UTF-8 byte size. The 8 MiB
budget includes the complete envelope. ACKs identify a sent stream/sequence and
cover all earlier events within the existing one-MiB credit window; backpressure
limits remain. Native leases count awake time, preserving channels across sleep.
Each relay connection's AbortSignal fences its single disconnect cleanup.

## Consequences

Execution lifetime is independent of renderer delivery. Unobserved tools can
finish and retain bounded results while terminals remain controllable after
reconnection. Native Quit remains the explicit owner cleanup boundary. Recovery
does not transfer profiles across accounts or origins and adds no server switch UI.

Focused source tests cover process survival, isolation, cancellation, bounded
results, bootstrap/session recovery and authorization races. Packaged macOS and
Windows acceptance must still verify real Herdr restoration, process trees,
WKWebView/WebView2 Origin and mixed-content rules, dialogs and system key storage.
The relay heartbeat exception window and broader RemoteControl concurrency remain
separate investigations; this decision does not claim they have been verified.
