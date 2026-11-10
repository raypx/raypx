# Terminal host and connectors

Claude and Codex terminal connectors deliver approval requests to the independent
CLI daemon. The MyGo Desktop host connects to that daemon.
The daemon runs TypeScript in its embedded stable Bun 1.4.4 executable, packaged
with minified ESM and depth-0 bytecode.
[ADR 0035](../architecture/0035-local-owner-host.md) defines local execution ownership. [ADR 0040](../architecture/0040-instance-enrollment-and-providers.md)
requires first-time local instance enrollment; local terminal approvals then work
offline without an active online session. Web delivery is a separately enabled
cloud scope. Native mobile remains separate.

## Execution and lifetime

On macOS and Windows, Desktop launches its bundled, version-matched CLI by
absolute path for finite `daemon desktop` bootstrap. The renderer connects directly
to a separate authenticated loopback WebSocket; narrow native IPC stays private (ADR 0052). The detached CLI owner holds SQLite, scheduling,
managed Agent processes, the outbound relay connection and terminal RequestBroker.
macOS uses a private authenticated Unix socket, with 0700 directories and 0600
socket/endpoint files. Windows uses token-guarded loopback transport and restricted
file ACLs (ADR 0037). There is no public local control listener.

Desktop's Terminal tool uses the selected project's directory and the daemon's
default shell, opened only by an explicit action. The daemon chooses a usable
absolute `SHELL` or Windows `ComSpec`, with a verified system fallback. Advanced
options allow an explicit executable, arguments and directory; a terminal without
a selected project requires an explicit directory. Herdr owns the PTY/terminal
state. External commands have ordinary operating system user permissions.

GUI Quit, renderer reload and loss of one renderer channel preserve managed Agent work.
Tools and interactive PTYs belong to their connected client and are cancelled
when that client disconnects. Explicit account logout, account/origin changes,
device revoke and disabling remote access cancel the affected binding. Merely
losing a browser cookie does not revoke daemon authorization. Explicit `daemon
stop` cancels owned processes. Daemon crash/stop or OS restart does not resume
uncertain model calls: managed runs become interrupted; pending external requests
fall back, and decided/delivered requests recover as outcome unknown.

A profile has one execution owner enforced by SQLite's OS-backed write lock.
A competing execution owner fails without cancelling or taking over the current owner.
Linux retains existing CLI support without complete product acceptance.

## Authorization and server selection

Select the server in `~/.raypx/config.toml`; the same Desktop package serves each
configured origin. Origin and account hash together select cloud host settings
and remote bindings. Terminal settings/history belong to the local profile.
Provider keys remain on the computer.

To enable cloud access, the daemon checks the current signed-in account,
supplies a trusted Origin and requests a restricted credential for the registered
device/epoch.
The credential goes straight to daemon IPC and `host_authorizations` in its existing `profile.sqlite`,
never the renderer, TOML/JSON files or logs. PostgreSQL stores only its hash. It
expires after 30 days and can mint only ten-minute grants for that device; it
cannot read account data or authenticate a viewer. Revoking it invalidates all
credentials/grants for that computer. Browser sessions remain necessary for
viewers and new authorization, but are not the daemon's renewal credential.

If a SQLite credential write fails the secret stays in memory and settings explicitly
show that restart requires authorization again. Initial network failure retries
without changing origin. Definite revocation or expiry requires authorization.
Bootstrap requires a session created within ten minutes and after the last
security revocation. Desktop provides an in-place password confirmation and retries
bootstrap without sign-out or task detachment. Successful single-session revocation
removes only credentials issued by that session; bulk session revocation applies
to all hosts. Each device has one current credential; reauthorization
rotates its key and derived grants. Password changes and session-security
revocation invalidate host access. `raypx login` enrolls a local profile by
requesting human approval at the account page; it does not enable cloud Host
access. Cloud authorization currently uses the Desktop account session.

## Terminal connectors

The Agent section of the global `#settings` dialog explicitly installs or removes
owned hooks for Claude and Codex. Equivalent commands, after building the
standalone binary:

```sh
raypx daemon start
raypx daemon status
raypx connectors install claude
raypx connectors install codex
raypx connectors status
raypx connectors uninstall claude
raypx connectors uninstall codex
raypx daemon stop
```

Installation verifies and copies the complete CLI/Herdr payload into a managed
version directory under `~/.raypx/bin/versions/`. The stable `~/.raypx/bin/raypx`
(`raypx.exe` on Windows) records its ownership digest and version inventory.
Missing or modified payload resources fail verification. The connector inserts an
incremental `PermissionRequest` hook into `~/.claude/settings.json` or
`~/.codex/hooks.json`. Existing settings and unrelated
hooks stay intact; edits, unsupported JSON formats, concurrent changes and another
Raypx profile's connector fail without overwriting them. Backups are private.
Existing file permissions, indentation and newline style are preserved. Symlinked
dotfiles return a specific manual-edit instruction and retain the original link.
`CLAUDE_CONFIG_DIR`, `CODEX_HOME` and `RAYPX_HOME` support isolated installations.
Codex users must trust the hook through `/hooks`; Raypx does not bypass that trust.

Connectors forward to the existing owner only; a tool approval never implicitly
starts a daemon. The hook skips Raypx-managed subprocesses to avoid duplicate
approval. Every connection, parsing or storage failure returns no decision to the
Agent's normal terminal flow.

Away defaults off. Users explicitly select already-authorized projects and enable
Away; waiting defaults to five minutes, configurable from one to ten. The installed
hook timeout is 630 seconds. Turning Away off, removing project/provider access,
or timeout releases affected hooks without approving or denying them. Each request
freezes its eligible local/cloud channels. A ready, visible, unminimized Desktop
renews its authenticated local lease every five seconds (15-second expiry). Only
a cloud binding that has connected before receives a 15-second disconnect grace.
Losing one channel does not cancel requests reachable through another eligible
channel. Logout/revoke/scope shrink withdraws cloud eligibility immediately.

The recorded capability gate currently enables **Bash permission allow/deny with
an optional rejection note** for both providers. Claude questions/plans and Codex
apply_patch/MCP approvals remain disabled until real contract recordings validate
them. Codex's official hook surface is broader than the enabled implementation.
Native-terminal simultaneous answering is not promised: the tested behavior is
remote waiting followed by terminal fallback.

## Protocol and UI

Clients and hosts require the current host authorization API. Protocol downgrade,
browser-grant fallback and automatic data import are unsupported.

Relay v4 adds observed session/request batches and ACKs after database commit;
only protocol 4 is supported. Other versions fail with UPGRADE_REQUIRED. Observed requests are separate from
ManagedTask and keep invocation ID, request ID, revision, host epoch, expiry and
immutable decision receipt. The host is the approval authority. Duplicate answers
with the same receipt return its original result; changing the answer, revision,
epoch or receipt cannot apply a second decision.

Web and Desktop expose a separate terminal-request section. Lists contain
bounded summaries; expansion fetches one tool input. The UI enables only the
request's validated capabilities, preserves a receipt after uncertain delivery,
and distinguishes decided, delivered and outcome unknown. Delivered means written
to the hook, not proof of the Agent applying it. Actual application is verified
separately by the live acceptance marker. Desktop system notifications work while
a GUI client is connected; full GUI Quit cannot deliver Desktop notifications.
While Away is waiting, Desktop exposes a persistent request banner and a tray
"Review requests" entry that opens local approvals. The MyGo native host owns
notifications; notification action buttons are not part of this acceptance.

Only new requests qualified for the explicitly enabled cloud project scope are
uploaded. Local-only requests and historical local records are not uploaded.
Projection withdrawal has its own revision and never invalidates a local decision.
Transcripts and tool output are not synchronized. Qualified requests reference only their selected
project names and provider session identities.
Content envelopes are explicitly `plain` for private testing. E2EE, pairing,
recovery and old-plaintext retention remain public-hosted-release gates.

## Verification

Default tests replay redacted real hook fixtures, exercise broker fencing,
retention/restart, private socket permissions, client disconnect ownership,
late native bootstrap and explicit logout versus cookie expiry. `bun run verify`
selects affected source checks and related tests, with Go checks for native
inputs. `bun run verify --full` adds complete suites, builds and current-platform
artifact probes. Database, browser, packaged native and live-provider acceptance
are separate gates.

The explicit live acceptance uses a synthetic account, isolated PostgreSQL/API,
temporary projects/configuration, real authenticated Claude/Codex CLIs and the
compiled daemon. It installs hooks only in those temporary config directories,
closes the Desktop proxy before each real approval, validates the exact harmless
command, and checks the resulting file. `RAYPX_P1_BROWSER_APPROVAL=1` waits for
actual Web UI clicks; otherwise the typed task client supplies the decision.

```sh
RAYPX_LIVE_AGENTS=1 \
RAYPX_HOST_ACCEPTANCE_CONFIG=/absolute/private/acceptance.json \
RAYPX_CODEX_BINARY=/absolute/path/to/codex \
bun run --cwd apps/cli smoke:daemon-agents
```

The private config contains loopback `apiUrl`, synthetic `email`, `password` and
`userId`; the harness rejects non-loopback origins. Never commit that file or raw
terminal captures. Live tests consume provider usage. API PostgreSQL tests require
an isolated `TEST_DATABASE_URL` ending in `_test`; packaged Native smoke remains
an explicit GUI gate. Local HTTP does not verify HTTPS production cookies, Beta,
hosted relay deployment or mobile behavior.

## Scope limits

Mobile background delivery, E2EE/recovery, full terminal session synchronization,
concurrent native/remote answering and Linux/Android service acceptance are not
established by these gates. Local managed Pi execution uses its separate SDK
runner; it does not expand the Claude/Codex terminal-hook contract, and remote
managed Pi admission remains disabled. Future work is tracked in the
[roadmap](../roadmap.md).
