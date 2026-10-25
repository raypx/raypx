# Terminal protocol P0 implementation

Status: protocol prototype implemented; the production daemon/Desktop migration
is not complete. This record does not establish the full P1 product loop.

## Implemented boundary

- Pure `/terminal` contracts separate observed sessions from managed task IDs.
  Requests carry an explicit plain encoding, revision, invocation ID, deadline
  and host epoch. Decisions require a receipt and matching request version.
- RequestBroker persists before releasing hooks, arbitrates one answer, recovers
  unfinished history as cancelled or outcome unknown, and distinguishes decided
  from delivered. It never invents an Agent consumption acknowledgement.
- A private Unix socket separates owner and hook credentials. Only explicitly
  authorized project roots can submit requests; no TCP listener or public local
  method router is added. Missing viewers, disabled Away and connection failures
  return no decision.
- Away defaults to 300 seconds, supports 60–600 seconds, and hook installation
  plans set a 630-second timeout. The installed matcher and advertised permission
  tools are limited to Bash; unverified question/plan capabilities remain off.
- Strict-JSON settings plans preserve unrelated fields and hooks, back up the
  original before replacement, detect changed files, install idempotently and
  preserve modified handlers during uninstall. JSONC is left for manual review.

This prototype has no public daemon command or system-service installer. Its
history is bounded to 256 requests, 64 pending requests and 1,024 sessions. When
history is full, completed requests and their receipts are reclaimed before new
requests are accepted; pending and not-yet-delivered decisions are retained.
Pending-capacity exhaustion falls back to the native flow. Time-based production
retention and account scoping belong to P1.

## Real CLI evidence

All live scenarios use temporary synthetic projects. Personal hook settings are
not changed; only configured provider authentication is used. Raw records remain
private. The reviewed fixtures are in the CLI test fixture directory.

| Provider and transport                  | Result                                                                                                                                      |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Claude Code 2.1.302, real terminal      | Bash allow, deny and Away-off native fallback through the Unix socket and durable broker passed.                                            |
| Claude print mode                       | Bash allow and deny also passed independently of terminal mode.                                                                             |
| Claude, delayed decision                | A real hook waited 65.025 seconds before an allow response; the expected marker was written. This is not a full 10-minute timeout test.     |
| Claude stream JSON                      | Actual partial-message and usage records are exported for projection regression.                                                            |
| Codex 0.163.0-alpha.11.2, real terminal | Bash allow and deny passed through the Unix socket and durable broker.                                                                      |
| Codex terminal fallback                 | With Away disabled, the hook completed without a decision and the native approval prompt appeared; the driver did not approve it.           |
| Codex app-server                        | A real message, streamed deltas and cumulative usage were recorded and replayed.                                                            |
| Both providers, approval client lost    | Stopping the synthetic approval client's heartbeat while the real hook waited released it to the native prompt without running the command. |
| Both providers, deadline expiry         | A configured 60-second wait expired, the hook completed without a decision and the native prompt appeared; no marker was written.           |

`codex exec` forces a never-approval policy in the tested version. It is therefore
not an acceptance transport for PermissionRequest, even if it exits successfully.
The live Codex hook gate uses a PTY. Its one-invocation hook-trust automation flag
is limited to the test's own recorder in a fresh configuration directory; it does
not change persisted trust. A real installation must still require `/hooks` review.

The fixture replay tests check actual hook response shapes, streaming message
identity and numeric usage. Handwritten fixtures remain for injected failures.
The default suite spends no provider usage.

## Default verification

On macOS with the pinned toolchain, the 34 terminal prototype tests and all
9 contracts tests pass. The full CLI suite passes 197 tests. `bun run verify`
passes repository policy, locale and formatting checks, lint, workspace type
checks/tests, Node and Cloudflare builds, and its artifact smoke checks
(47 Turbo tasks, including cached unaffected tasks).

This run does not establish PostgreSQL/Redis integration, Windows, native GUI,
iOS or Docker deployment. Unix-socket integration tests are excluded on Windows;
the prototype explicitly rejects that platform instead of exposing a TCP fallback.

## Repeat the live gates

These commands invoke real models. Select the pinned repository Bun/Node first.
Supply an installed provider binary explicitly if it is not on PATH.

```sh
RAYPX_LIVE_AGENTS=1 RAYPX_P0_TRANSPORT=terminal bun run --cwd apps/cli smoke:terminal claude
RAYPX_LIVE_AGENTS=1 bun run --cwd apps/cli smoke:terminal codex
RAYPX_LIVE_AGENTS=1 RAYPX_P0_DECISION=deny bun run --cwd apps/cli smoke:terminal codex
RAYPX_LIVE_AGENTS=1 RAYPX_P0_DECISION=fallback bun run --cwd apps/cli smoke:terminal codex
RAYPX_LIVE_AGENTS=1 RAYPX_P0_DECISION=disconnected bun run --cwd apps/cli smoke:terminal codex
RAYPX_LIVE_AGENTS=1 RAYPX_P0_DECISION=expired bun run --cwd apps/cli smoke:terminal codex
RAYPX_LIVE_AGENTS=1 bun run --cwd apps/cli smoke:terminal-stream
```

Use `RAYPX_P0_TRANSPORT=terminal` with Claude for each scenario as well. The driver
never answers a tool approval. Fallback acceptance requires both a completed hook
with no decision and the visible native prompt, not merely a prompt appearing
while a hook might still be running. The live owner's heartbeat is a synthetic
client; this evidence does not establish cloud relay integration.

Repeat after CLI upgrades, before adapter releases and weekly on an authenticated
controlled machine. Export with `tests/smoke/export-terminal-recording.ts`, inspect
the redaction, then run the default replay tests. No unattended schedule or CI
credential configuration has been installed by this change.

## Follow-on status

The [P1 implementation](terminal-host-p1.md) now promotes the private broker into
an independent macOS daemon with restricted host authorization, relay v3 and
Web/Desktop observed-request approvals. P0 remains the source of recorded vendor
contract evidence. Its original standalone smoke does not by itself prove relay
integration; use P1's real PostgreSQL/relay acceptance for that claim.

Concurrent terminal/remote answering, questions/plans, Codex apply_patch/MCP,
interactive trust UX and the full maximum-duration timeout remain open gates.
Personal hook/service installation, production HTTPS rollout and Expo/iOS require
their own explicit acceptance; no P0 fixture can stand in for those checks.

## Review follow-up

The 256-request boundary is covered by a 300-request regression including receipt
cleanup. Project paths map to persisted random IDs. Hook parsing uses the enabled
capabilities for both providers. Settings replacement preserves file permissions,
indentation and newline style; symbolic links return an explicit manual-dotfiles
instruction without replacing the link. Private socket directories carry a profile
ownership marker; a SIGKILL/restart fixture verifies safe reclamation of a matching
stale directory without recursively deleting unknown files. The production hook
command sends its delivered acknowledgement only after writing its response.

The isolated P0 commit passed CLI checks and 204 tests, plus contracts checks and
9 tests. It requires no daemon package or P1 relay schema to build or run.
