# Terminal host P1 review remediation — 2026-10-25

Baseline: canary `3fede0a`, including the separately committed remediation and P0
prototype. The review was recorded against their earlier uncommitted state. This
record covers the P1 findings; it does not introduce Expo, E2EE or broader Agent
capabilities.

## High-priority findings

| Finding                                      | Resolution                                                                                                                                                                                                                                                             | Regression                                                                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1: split event corrupts proxy NDJSON        | Decode UTF-8 incrementally and enqueue complete bounded event lines. RPC responses can only appear between records. Truncated or oversized records close the affected client.                                                                                          | Actual proxy subprocess, split 128k terminal event concurrent with RPC; byte-by-byte emoji and truncated stream.                                          |
| H2: incompatible owner cannot stop           | Administrative status/stop accept an older version of the known IPC protocol. Stop waits for the ownership lock. `daemon restart` explicitly stops owned work before launching the current binary. Build identity also distinguishes builds sharing a package version. | Older-version Unix server and OS lock; shutdown admission; standalone installer lifecycle; Native mismatch/replacement test and shadcn confirmation test. |
| H3: server consumes host revisions           | Server cancellation keeps a separate marker and preserves the host revision. Host terminal states replace that projection. The legacy same-revision cancellation can also recover after an epoch change.                                                               | Pending → new epoch → expired at the host's next revision; legacy collision recovery; later requests continue.                                            |
| H4: expired authorization remains authorized | RemoteControl delegates terminal credential failure to its owner. Daemon clears the selected binding and Keychain value, releases terminal waiters and emits a reauthorization event. Queued callbacks fence the original binding.                                     | Real local relay and HTTP grant fixture; expired grant response leaves `authorized: false`, `AUTH_REQUIRED`, no cached key and terminal fallback.         |

Desktop provides an explicit **Stop old host and update** recovery action. Its
confirmation states that the old owner's active tasks will be cancelled. Ordinary
retry does not stop a detached owner's work. A failure to finish stopping remains
recoverable; no blind PID kill or automatic replay is added.

## Medium-priority findings

| Finding                                                 | Resolution                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1: every settings save releases hooks                  | Reconfigure project/Away policy in place. Wait changes apply to future requests; adding a project preserves pending requests and epoch. Removing access withdraws only affected requests; Away off withdraws all.                                                                                                                                                              |
| M2: GUI/service loses custom config directories         | `[connectors]` in user TOML selects absolute paths. Native passes its loaded config/environment explicitly. launchd preserves the supported environment overrides, and successful installs remember their destinations per profile. Status shows the actual settings path.                                                                                                     |
| M3: stale/missing hook executable looks installed       | Check executable presence, execution permission and ownership digest. Show update/repair separately from uninstall. Compiled proxy/owner startup refreshes an existing owned installation. Version/build metadata prevents an older binary overwriting a newer one; externally modified executables require review.                                                            |
| M4: no old-server compatibility                         | A rejected v3 handshake falls back once to v2, with a fresh authentication attempt; explicit reattachment retries the preferred version. Only managed actions remain enabled. If the host API is absent, Native uses browser-renewed device grants; auth/network failures do not trigger this fallback. Plain HTTP 404 and typed RPC NOT_FOUND are both covered.               |
| M5: eight unusable keys exhaust authorization           | Atomically replace the device's prior credential and derived grants. The existing account write lock serializes issuance; it was already present. Repeated loss of Keychain no longer accumulates eight live keys.                                                                                                                                                             |
| M6: security revocation leaves host keys usable         | Bootstrap needs a session created within ten minutes. Credentials bind a password fingerprint and account security epoch. Password changes/reset invalidate them. Session-security revocation advances the epoch, removes host keys and prevents the old cookie minting a replacement during the revocation race. Ordinary cookie expiry/sign-out is not this security action. |
| M7: stopped owner admits clients                        | Mark closing before returning the stop ACK; reject new event/RPC clients immediately. Startup waits for owner lock release.                                                                                                                                                                                                                                                    |
| M8: background rejection exits owner                    | Consume renewal/maintenance/shutdown promise failures. An owner-scoped unhandled-rejection handler emits a bounded diagnostic without private exception content.                                                                                                                                                                                                               |
| M9: independently truncated sessions lose valid actions | Select the request page first, prioritizing pending requests; include exactly its referenced sessions, up to the same 100-item bound.                                                                                                                                                                                                                                          |

The old-server fallback retains the daemon's local process lifetime, but it cannot
renew browser-backed relay grants after Desktop fully quits. Terminal approvals
and independent host authorization require the upgraded server. UI discloses this
boundary rather than advertising v3 capabilities over v2.

## Additional follow-up

- Select test helpers open with keyboard input and reacquire the trigger, avoiding
  a pointer-open/close race seen during concurrent verification.
- Capability helpers now drive parsing, hook matchers and approval buttons.
- Cloudflare `/relay` uses the same normalized trusted-origin list as HTTP CORS
  and auth, including trailing slashes and malformed-entry rejection.
- P0 socket crash cleanup already landed before this review was finalized; its
  SIGKILL/restart regression remains in the default suite.
- Managed-session suppression uses the daemon's actual provider session IDs.
  An inherited `RAYPX_MANAGED_AGENT=1` no longer suppresses nested external agents.

## Configuration and migration

Continue using `~/.raypx/config.toml` (or absolute `RAYPX_HOME`). Optional paths:

```toml
[connectors]
claude_config_dir = "/absolute/path/to/claude-config"
codex_home = "/absolute/path/to/codex-config"
```

Desktop loads these paths on startup; restart it after config edits. Explicit
Native request/config paths precede ambient environment, remembered installation
paths and provider defaults. A symbolic settings file still requires manual edits
in its dotfiles target; Raypx does not replace that symlink.

Apply generated migration `20261025094105_overjoyed_nebula` before deploying the
new API. It adds `security_epoch` and `security_revoked_at` to `control_owner`.
Existing private-testing host credentials have no security fingerprint and require
fresh authorization. Signing in again supplies the recent session needed for
bootstrap; expiry of an ordinary browser cookie does not revoke a valid host key.

## Acceptance

The default suite uses redacted protocol recordings and synthetic local servers;
it does not consume model usage. PostgreSQL acceptance uses a newly initialized,
loopback-only `raypx_p1_review_test` database. Installer smoke modifies only a
private temporary home and removes its daemon afterwards. No personal hook,
launchd service or deployed environment is changed.

| Gate                                 | Result                                                                                                                             |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| Repository verify                    | 49/49 tasks; API 96, CLI 218, Desktop 151, Web 63 tests; Node/Cloudflare/standalone artifact probes passed.                        |
| Real PostgreSQL                      | 16/16 tests passed, including the generated migration, credential fingerprints and security revocation.                            |
| Local Cloudflare worker + PostgreSQL | 4/4 passed using direct and Hyperdrive adapters. The direct leaf runner required explicit NODE_BINARY for the pinned Node runtime. |
| macOS packaged GUI                   | Shell plus both restore/server-switch phases passed; tray, approval shortcut, preferences, bridge and GUI Quit lifetime passed.    |
| Standalone connector lifecycle       | Temporary home, empty PATH: install/status, missing-binary repair, downgrade rejection, startup update and clean stop passed.      |
| Real provider use                    | No new inference run; default tests replay the previously recorded Claude/Codex contracts.                                         |

Private logs are in ignored `.artifacts/task-workspace/p1-review-*.log`.
Production HTTPS/edge,
real launchd registration, Windows, iOS, notification action buttons, concurrent
native-terminal answering and full ten-minute provider waits remain separate gates.
