# Terminal host P1 — macOS private testing

Implemented after the [P0 protocol gate](terminal-protocol-p0.md). Claude and Codex are both
included. [ADR 0035](../architecture/0035-local-owner-host.md) supersedes the
original cloud-bound ownership: local Desktop terminal approvals need no account;
Web delivery is a separately enabled cloud scope. Native mobile remains separate.

## Execution and lifetime

On macOS Desktop launches its bundled, version-matched CLI as `daemon proxy`.
The proxy connects through a private authenticated Unix socket to a detached CLI
owner. The owner holds SQLite, scheduling, managed Agent processes, the outbound
relay connection and terminal RequestBroker. Socket directories are 0700 and
socket/endpoint files 0600; there is no public local HTTP listener.

GUI Quit, renderer reload and loss of one proxy preserve managed Agent work.
Tools and interactive PTYs belong to their connected client and are cancelled
when that client disconnects. Explicit account logout, account/origin changes,
device revoke and disabling remote access cancel the affected binding. Merely
losing a browser cookie does not revoke daemon authorization. Explicit `daemon
stop` cancels owned processes. Daemon crash/stop or OS restart does not resume
uncertain model calls: managed runs become interrupted; pending external requests
fall back, and decided/delivered requests recover as outcome unknown.

A profile has one execution owner enforced by SQLite's OS-backed write lock.
A competing legacy host fails rather than repairing/cancelling the running owner.
Windows runs the daemon and hook host over token-guarded loopback (ADR 0037).
Linux retains existing CLI support without complete product acceptance.

## Authorization and server selection

Continue selecting the server in `~/.raypx/config.toml`; do not compile separate
beta/production clients. Origin and account hash together select cloud host settings
and remote bindings. Terminal settings/history belong to the local profile.
Provider keys remain on the computer.

For this first Desktop-assisted bootstrap, Native checks the current browser
account, supplies a trusted Origin, and requests a restricted credential for the registered device/epoch.
The credential goes straight to daemon IPC and macOS Keychain (`pro.raypx.daemon`),
never the renderer, TOML/JSON files or logs. PostgreSQL stores only its hash. It
expires after 30 days and can mint only ten-minute grants for that device; it
cannot read account data or authenticate a viewer. Revoking it invalidates all
credentials/grants for that computer. Browser sessions remain necessary for
viewers and new authorization, but are not the daemon's renewal credential.

If Keychain is unavailable the secret stays in memory and settings explicitly
show that restart requires authorization again. Initial network failure retries
without changing origin. Definite revocation or expiry requires authorization.
Bootstrap requires a session created within ten minutes and after the last
security revocation. Desktop provides an in-place password confirmation and retries
bootstrap without sign-out or task detachment. Successful single-session revocation
removes only credentials issued by that session; bulk session revocation applies
to all hosts. Each device has one current credential; reauthorization
rotates its key and derived grants. Password changes and session-security
revocation invalidate host access. Full Better Auth device-code login remains
needed for CLI-only onboarding; this phase does not claim that headless login flow.

## Terminal connectors

Desktop Agent settings explicitly install/remove owned hooks for Claude and
Codex. Equivalent commands, after building the standalone binary:

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

Installation copies the compiled CLI into `~/.raypx/bin/raypx`, preserving an
ownership digest, and inserts an incremental `PermissionRequest` hook into
`~/.claude/settings.json` or `~/.codex/hooks.json`. Existing settings and unrelated
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

Relay v3 adds observed session/request batches and ACKs after database commit;
only protocol 3 is supported. Other versions fail with UPGRADE_REQUIRED. Observed requests are separate from
ManagedTask and keep invocation ID, request ID, revision, host epoch, expiry and
immutable decision receipt. The host is the approval authority. Duplicate answers
with the same receipt return its original result; changing the answer, revision,
epoch or receipt cannot apply a second decision.

Web and macOS Desktop show a separate terminal-request section. Lists contain
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
late Native bootstrap and explicit logout versus cookie expiry. `bun run verify`
also covers all existing workspaces and both deployment builds.

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

## Remaining deliveries

Expo iOS foreground app, APNs/FCM, E2EE and recovery, full session synchronization,
ACP/Pi Agent runners, terminal concurrent answering, headless device-code login,
Linux/Android services, worktree workflows and restartable runners remain separate
phases. Model calls in `packages/ai` are not an installed Pi Agent runner.

## Acceptance recorded on 2026-10-25

| Gate                          | Result                                                                                                                                                                            |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full repository verify        | Passed: check/test/lint, Node builds, relocated artifact probes and standalone CLI smoke                                                                                          |
| Application tests             | API 90, CLI 202, Desktop 144, Web 63 passed                                                                                                                                       |
| Isolated PostgreSQL           | 15/15 passed, including actual replay-window SQL and EXPLAIN                                                                                                                      |
| Real terminal + browser       | Claude 2.1.302 and Codex 0.163.0-alpha.11.2: isolated installed hooks → daemon → Node API/PostgreSQL/relay → Web button → real marker file; Desktop proxy disconnected throughout |
| Persistent host authorization | Keychain stored the synthetic host credential; reconnecting GUI and restarting daemon restored the connection without browser bootstrap                                           |
| macOS packaged GUI            | Shell and both restore phases passed; actual GUI Quit left its owner running; runtime-origin and device preference isolation passed                                               |
| Responsive approval           | Actual Web UI at desktop width and 390×844, including delivered state                                                                                                             |

Private logs and screenshots are under `.artifacts/task-workspace/p1-*`; they are
not committed. Native system-notification presentation, interactive Codex trust,
real launchd registration, full ten-minute wait, production HTTPS/Beta rollout,
Windows CEF, iOS, Redis and Docker were not validated by this P1 acceptance.

## Review follow-up acceptance

The subsequent review fixes passed the full repository gate (49 Turbo tasks;
API 91, CLI 208, Desktop 145, Web 63 tests). macOS packaged shell and both restore
phases passed again, including the tray request shortcut and preservation of the
daemon after GUI Quit. Focused regressions cover 300 successive terminal requests,
receipt reclamation, symlink/permission handling, stale socket cleanup after
SIGKILL, the persistent Desktop request banner, optional VACUUM failures and
normalized/invalid origin configuration. This follow-up does not add a new live
provider, PostgreSQL, production or mobile acceptance claim.

## Subsequent review

[The P1 review remediation](terminal-host-p1-review.md) records stream framing,
host-owned revisions, authorization revocation and connector updates. That historical
record includes transitional compatibility and migration behavior removed on 2026-10-31.
Current clients and hosts require Relay v3 and the current host authorization API;
there is no protocol downgrade, browser-grant fallback or automatic data import.
