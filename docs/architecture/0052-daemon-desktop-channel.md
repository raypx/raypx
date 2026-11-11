# ADR 0052: Daemon-owned Desktop session and renderer channel

Date: 2026-11-10

Status: Accepted

Execution lifetime and session recovery clauses are superseded by [ADR 0054](0054-desktop-execution-recovery.md).

## Context

Desktop currently duplicates session storage, HTTP admission and event delivery in
Go. The independent CLI daemon already owns the profile, device credentials and
execution lifecycle. Moving those policies to it needs a renderer boundary that
does not expose the administrative local router or invalidate offline enrollment.

## Decision

The daemon owns Desktop account sessions, the selected-origin API proxy and the
acknowledged renderer event stream. Persistent session cookies use an encrypted
table in the existing profile SQLite database. The native host obtains a new
profile-scoped key from the OS secret store and supplies it only through private
IPC. An unavailable key permits memory-only sign-in while preserving stored rows;
a failed persistence write disables the session transport until restart. No old
Go session database, key namespace or credential history is imported or deleted.

The native host retains windows, tray, notifications, dialogs, updater, device
preferences, the existing lifetime instance lock and absolute-path launch of the
version-matched bundled CLI. Its finite bootstrap command uses the daemon's
authenticated administrative IPC: Unix socket on POSIX and token-guarded loopback
on Windows. Administrative credentials, cookie values and encryption keys never
enter the renderer.

The renderer uses a separate loopback WebSocket listener. Native bootstrap issues
an ephemeral capability for one configured API origin and native-owned connector
configuration. The listener binds only 127.0.0.1, checks exact Host and the owned
WebView/dev Origin, authenticates in the first frame, and bounds unauthenticated
peers, deadlines, frame sizes, pending requests and unacknowledged events. Tokens
are not URL parameters. The capability grants only the existing renderer method
surface, selected-origin HTTP proxy and account-control use cases. It cannot call
the administrative router, register arbitrary directories, assert native window
visibility or access restricted Host credentials. Native directory pickers and
visibility changes use private IPC separately.

TypeScript contracts are authoritative for request validation and API exposure.
Daemon policy verifies the account through its own cookie session, injects the
configured origin, enforces device-owned local task access and performs Host
authorization without returning credentials. Native JSON transport contains no
second business schema or cookie policy.

Closing a renderer channel cancels its pending HTTP requests, tools, terminals and
approval lease. It does not detach accepted Agent tasks, stop scheduling, remove
device preferences or discard the signed offline identity. Explicit logout or
account/origin change revokes the affected remote binding. Unsupported protocol
versions fail; explicit owner replacement remains necessary across incompatible
bundled builds.

## Consequences

Go no longer implements a cookie jar, session database, API proxy or acknowledged
event queue. The daemon is the single local credential/storage policy boundary.
The renderer's loopback channel is a deliberately smaller surface than private
administrative IPC. Source and headless transport checks do not establish native
WKWebView/WebView2 Origin, mixed-content or packaged acceptance; those remain
explicit platform gates.
