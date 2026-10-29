# ADR 0035: Single Owner local Host with optional cloud channels

Status: accepted, 2026-10-27. Incremental implementation from `c3020e4`.

Each profile has one Owner and one Bun + TypeScript Host. Local tasks, project
grants, connectors, SQLite, terminal settings and broker work without login.
Cloud control owns origin/account credentials, grant renewal, relay and opted-in
projections. Cloud restore runs in the background; local RPC never joins its
serial queue. Signing in does not enable remote execution or upload local history.
The MyGo composition root uses Go; its checks run through the shared VP graph.
The unused Rust experiment and its independent CI have been removed.

## Local terminal ownership

One broker uses `<profile>/terminal/terminal.sqlite`; its OS owner lock is at
profile level. Hook discovery remains `<profile>/terminal-hook.json`. Settings
are atomically saved in `<profile>/terminal/settings.json`. `/away` calls this
same settings service. `/state` is a read and never renews a viewer lease.

Private IPC methods are `approvals.local.settings/configure/list/get/decide/watch`.
They accept no account or origin. `runtime.info.features.localTerminalApprovals`
advertises availability. Native does not inject a cloud origin. Renderer calls to
`watch` and `host.*` are forbidden; non-daemon stdio returns `DAEMON_REQUIRED`.
`host.terminal.settings/configure` configures explicit per-binding cloud opt-in.
Old private `observed.settings/configure/list/get/decide` are removed without a
renderer compatibility layer: bundled CLI, daemon and Desktop use existing
version/build-identity checks and controlled owner replacement.
Public HTTP `observed.list/get`, relay `observed.decide` and private
`observed.remote` remain. Local display identity uses the persisted
`AgentStore.deviceId(desktopBinding(LOCAL_WORKSPACE_ID))`, independent of login.

## Request channels and decisions

Before publishing each pending request, the Host freezes its eligible channels.
The local channel is this profile's Owner; remote eligibility binds the concrete
origin/account/device/authorization epoch and authorized project at creation.
Remote eligibility may be withdrawn but never added later by login, scope
expansion or re-enabling. It is private, generation-local metadata, not restored
after a broker restart.

Native renews the authenticated connection's local lease every five seconds only
while its window is visible, unminimized and the feature is ready. Leases expire
after fifteen seconds, and hide/Quit/disconnect releases them. A same-OS-user CLI
holding the daemon token is within the same Owner trust domain; a lease is not
proof that the caller is the Native application. No background local takeover is
advertised. This release retains `simultaneousAnswers=false`.

Creation and the one-second watchdog check reachability for each request, not a
global local-or-cloud flag. Only a cloud binding that previously connected gets
a fifteen-second disconnect grace period. Explicit logout, revoke and scope
shrink withdraw eligibility immediately. Grace never extends the request deadline.
One request's cloud channel cannot keep a local-only request alive. Losing every
eligible reachable channel returns control to the original terminal, never allow.
The broker remains the only arbiter for ID, epoch, revision and receipt.

Cloud project scope must be a subset of local project authorization. Local removal
shrinks cloud scopes and cancels affected broker requests. Cloud scope changes
cannot expand local authorization.

## Projection withdrawal and relay generations

Normal projections use the broker revision. A withdrawn, already-sent pending
request gets a **separate projection revision** greater than its last sent value,
with cancelled status and no body/questions/decision. The Host does not mutate
the broker revision, status, receipt or waiter. Unsent requests simply stop
projection. A withdrawn request is never sent to that binding again, including
later local outcomes, even after re-enabling. A valid local answer keeps working.

Every relay connection first sends and acknowledges an empty current-epoch frame.
The server cancels old-epoch pending projections even without new requests.
Subsequent frames contain only eligible requests and their referenced sessions.
Acknowledgements are fenced by binding, connection generation, epoch and frame
revision; an old ACK cannot advance a new connection's state.

Desktop aggregation keys requests by `(id, epoch)` and always prefers local
records over cloud records, regardless of revision. It routes to local when that
pair exists locally; it does not compare cloud device IDs. An uncertain decision
is never automatically retried over another channel.

## Upgrade and data boundaries

Automatic migration requires all of: valid `host-binding.json`, a matching valid
`host-session.json` with normalized origin/account, valid legacy `observed.json`
in the selected binding directory, and that directory's parsed
`remote-control.json` with `accounts[accountId].enabled === true`.
The shared settings reader is pure: no RemoteControl construction, new directory,
installation ID, writes or network. Missing and corrupt files remain distinct.

A valid source seeds local rootIds/Away/wait and preserves enabled cloud terminal
sharing for that exact binding with the same project scope, offline. Other
accounts/origins are never merged. A versioned atomic state makes migration
repeatable; source files are preserved. Without an explicit current binding, even
a single legacy directory is not inferred. Defaults are Away off, empty project
scope and cloud sharing off; unsafe migration shows a reconfiguration notice.

Legacy terminal databases remain in place and are not imported or uploaded.
Restart recovery remains pending → cancelled and decided/delivered →
outcome_unknown. Account changes preserve `LOCAL_WORKSPACE_ID` work/settings;
legacy `server:<origin>:<account>` work retains the existing detach rule.

## Execution adapters and scope

The CLI-private Registry owns discovery, factories and version probes, bounded
to three seconds and 4 KiB. Drivers receive an approval port for direct Codex
requests or Claude HTTP hooks. Their lifecycle handle does not expose a protocol
process requirement. Raw provider records still go to the existing conversation
parsers. The coordinator keeps plan approval and persistence: Codex continues in
the same process, Claude may replace a process with `holdPlanOnExit`, and turn/
generation guards and managed-session recognition remain. Pi/ACP are not registered.

macOS is the product acceptance target. Windows keeps foreground mode; Linux keeps
existing CLI support without a complete product acceptance claim. Configuration
sync, local Web, standalone Server, native mobile, team ownership and additional
providers are separate deliveries. Future sync begins with explicitly enabled
non-sensitive preferences/configuration, local override and conflict preservation;
credentials, path grants and content require separate design.

## Verification boundary

Default tests exercise offline readiness under blocked cloud restore, per-request
channels, migration safety, withdrawal revision independence, route restrictions,
adapter lifecycle and Go host transport. Full validation uses `bun run verify`.
Packaged macOS and live hook checks are separate, isolated by profile,
`RAYPX_HOME`, `CLAUDE_CONFIG_DIR` and `CODEX_HOME`; they do not edit personal hooks
or system services. Real prompt visibility is measured only from timestamped PTY
output during a delayed hook, never from fallback output after it returns. Seeing
a prompt is not evidence of correct simultaneous answer consumption/arbitration.
Unavailable real-server/HTTPS/Windows/Linux checks must be reported as unverified.
