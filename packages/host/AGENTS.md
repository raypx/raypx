# @raypx/host

## Purpose

Shared Bun-only outbound remote-control transport for the CLI daemon and the
legacy Desktop host. Domain schemas remain in contracts; execution stays in CLI.

## Interface

Public exports are `RemoteControl`, `ControlInfo` and `serverOrigin`. Inject the
local engine, credential renewal, notifications and optional observed-session
projection/acknowledgement callbacks. Protocol 2 remains the managed-only fallback;
protocol 3 adds terminal requests. Renderer code imports pure types from contracts.

## Constraints

Never import applications, browser authentication or provider credentials. Keep
replay, command receipts, connection fencing and bounded renewal/backoff behavior.
Only explicit detach cancels execution; a daemon client's disconnect is not detach.
Validate remote origins and keep secrets out of disk settings and diagnostics.

## Verification

Run this workspace's `check`, `test` and `test:integration` commands. Transport
regressions live in `tests/integration/`, grouped by renewal, replay and snapshots;
`tests/helpers/control.ts` owns a fresh loopback relay and temporary state per case.
CLI retains daemon integration tests for its application-specific lifecycle.

A rejected v3 handshake negotiates managed-only v2 once. Do not send observed
frames or advertise terminal support on that connection. Terminal renewal failures
call the owner's authorization-loss handler; that handler owns binding cleanup.
Consume background promise failures and fence queued cleanup to its original binding.
Always authenticate with the configured preferred protocol on a new connection
cycle, including grant renewal; the accepted version is connection-local state.

A new host advertises `announce.syncSupported`. Internal server sync requests use
`resume.syncId`; never reset the cursor, reconnect or detach for these requests.
Queue each distinct ID through the current flush, carry it on every snapshot page,
and remove it only after the matching snapshot ACK. A request arriving while
another snapshot is in flight must retain its own authoritative checkpoint.

Hosts advertise `announce.contextSupported` for frozen task reference snapshots;
the transport forwards these snapshots and never resolves device library entries.
