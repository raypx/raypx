# @raypx/host

## Purpose

Bun-only outbound remote-control transport for the CLI daemon.
Domain schemas live in Core; contracts owns wire envelopes; execution stays in CLI.

## Interface

Public exports are `RemoteControl`, `ControlInfo`, `serverOrigin` and the pure
`readRemoteControlSettings` reader. The reader shares runtime parsing rules but
must not create directories, IDs, files, controllers or network activity. Inject the
local engine, credential renewal, notifications and optional observed-session
projection/acknowledgement callbacks. Relay requires protocol 3 and stops with
UPGRADE_REQUIRED on unsupported versions. Renderer imports pure contract types.

## Constraints

Never import applications, browser authentication or provider credentials. Keep
replay, command receipts, connection fencing and bounded renewal/backoff behavior.
Only explicit detach cancels execution; a daemon client's disconnect is not detach.
Validate remote origins and keep secrets out of disk settings and diagnostics.

## Verification

Run this workspace's `check`, `test`, `test:unit` and `test:integration` commands. Transport
regressions live in `tests/integration/`, grouped by renewal, replay and snapshots;
`tests/helpers/control.ts` owns a fresh loopback relay and temporary state per case.
CLI retains daemon integration tests for its application-specific lifecycle.
`tests/unit/scheduler.test.ts` uses injected sockets and the client's manual scheduler
for exact retry, renewal-drain and acknowledgement deadlines. RemoteControl forwards
one scheduler to RelayConnection so clocks, jitter and all timers share one source.
Keep loopback coverage for actual authentication, command delivery and renewal.

Unsupported handshakes stop with UPGRADE_REQUIRED. Terminal renewal failures call
the owner's authorization-loss handler, which owns binding cleanup. Consume background
promise failures and fence queued cleanup to its original binding. Always authenticate
with protocol 3, including after grant renewal or an explicit restart.

A new host advertises `announce.syncSupported`. Internal server sync requests use
`resume.syncId`; never reset the cursor, reconnect or detach for these requests.
Queue each distinct ID through the current flush, carry it on every snapshot page,
and remove it only after the matching snapshot ACK. A request arriving while
another snapshot is in flight must retain its own authoritative checkpoint.

Hosts advertise `announce.contextSupported` for frozen task reference snapshots;
the transport forwards these snapshots and never resolves device library entries.
