# Review remediation — 2026-10-25

> Historical validation record. Legacy protocol fallback, local-account workspaces,
> storage migration and compatibility exports described below were removed on 2026-10-31.
> Current behavior is specified by the architecture documents and package instructions.

> Historical validation snapshot: the Worker deployment target and its gates have been removed.
> Current deployment and verification use Node; commands below record the earlier state.

Scope: the follow-up review of canary `9954a03`, plus the existing uncommitted
shell/task-workspace changes. Generated migration SQL and raypx-kit are unchanged.
This record describes source changes and checks, not a production deployment.

## High and medium findings

| Finding                                             | Change                                                                                                                                                                                                                                                                                                                 | Regression evidence                                                                                                                                                           |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1 — malformed surrogate poisons relay writes       | Shared `taskText` clips within the existing UTF-16 schema budget without splitting a code point. CLI storage reads/writes and API JSON boundaries replace lone surrogates and NUL while retaining valid pairs. Relay parsing distinguishes malformed frames from internal failures (`SERVER_UNAVAILABLE`, close 1011). | Contracts/CLI Unicode tests; relay internal-error classification; actual PostgreSQL malformed 32k message and subsequent status ACK/read.                                     |
| M1 — localhost router links open externally         | Renderer interception excludes same-origin HTTP(S) links, preserving native external URL validation.                                                                                                                                                                                                                   | Renderer tests for development and packaged links, nested click targets and unsafe schemes.                                                                                   |
| M2 — pruning on every stream delta                  | Deltas update the authoritative activity projection without retaining raw replay rows. Delta-only batches do not prune. Replay gaps return an authoritative reset. The actual window DELETE now materializes its window once, avoiding repeated window evaluation with stale device statistics.                        | Delta/prune isolation regression; real PostgreSQL EXPLAIN ANALYZE, independent 4096-row and 8 MiB bounds, activity preservation.                                              |
| M3 — repeated legacy SQLite scans and retained disk | Indexed `GLOB 'desktop:*'` cleanup runs once behind a migration marker. VACUUM reclaims the old file; a pending marker retries reclamation after a crash or a busy reader without repeating deletion.                                                                                                                  | 20,000 legacy revisions, reclaimed file size, indexed query plan and second-start no-cleanup/no-VACUUM checks.                                                                |
| M4 — stale PID and lock takeover races              | A lifetime SQLite exclusive OS file lock replaces PID liveness checks. Exit/crash releases ownership. The permanent lock file is never unlinked. Duplicate-instance notice includes the lock path.                                                                                                                     | Same-process exclusion, subprocess SIGKILL recovery, obsolete live-PID metadata, six concurrent contenders with exactly one owner. Windows execution remains a separate gate. |
| M5 — decreasing Codex totals                        | Counter decreases replace the saved baseline and mark that turn's usage unknown. Later updates continue from the new baseline; a subsequent turn can report known usage again.                                                                                                                                         | Counter reset/decrease fixture tests. Real Codex resume accounting was not inferred from these fixtures.                                                                      |
| M6 — steer timer can stop a healthy turn            | Explicitly rejected Codex steers wait for actual completion, with no interrupt deadline. Claude interrupt timers replace older timers and verify runner/input ownership before expiring. A natural plan result crossing a steer dispatches that input before requesting implementation approval.                       | Two rejected steers remain queued beyond ten seconds, then execute after completion; existing Claude interrupt/natural-result tests.                                          |
| M7 — transactional index migration blocks writers   | Preserve generated migration history. `update.sh` stops the API before migrations and requires a maintenance window. Migration lock waits are bounded to ten seconds. Dokploy auto-redeploy must be disabled for these releases.                                                                                       | Deployment command-order tests and real PostgreSQL migration gate. No claim of concurrent or zero-downtime DDL.                                                               |

## Lower-priority findings

- Forwarded IP parsing traverses only the trusted suffix, stops at the first
  untrusted hop and accepts IPv4 ports/bracketed IPv6. Tests include multiple
  forwarded header values, invalid attacker prefixes and an all-trusted chain.
- Conversation history retains multiple independent gaps and places each load
  control at its segment. Loading one gap does not remove another.
- Unified diffs split file headers after a hunk's declared line counts; header-like
  source inside a hunk remains content. Codex `move_path` appears as a rename.
- Select test helpers reacquire live options and compare the full selected label.
- Native renewal drains current command callbacks for at most ten seconds and
  declines new callbacks during the drain; running tasks are not cancelled.
- Session recovery reports the actual quarantined file. Healthy startup also
  removes expired recovery files; retention is three files/seven days. Retention
  failures do not invalidate an otherwise usable session.
- CSRF origins normalize HTTP(S) trailing slashes while retaining native schemes.
- Failed API/Web replacement restores the previous running image digests. Migration
  failure restarts the untouched API. Recovery retains the database; the deployment
  guide covers failed rollback and separately retained protected environment files.
- Input interruption provenance no longer labels normal stop/delivery failure as
  host restart. AI endpoint comparison ignores an equivalent trailing slash.
  CLI artifact-smoke evidence lives in `.artifacts/cli/provider-smoke.json` outside
  cache-restored build outputs.
- The shadcn Sidebar uses one responsive state at 760px; its tooltip is driven by
  collapsed state. Blocks persists the desktop-width choice locally and follows
  cross-window changes. File/automation deletion labels use the localized catalog.
- Native acceptance also exposed an exit-time `EPIPE`: retiring the engine's
  stdout reader cancelled the pipe while CLI cancellation results were still being
  written. The host now drains retired output to EOF without delivering stale
  events. A subprocess regression writes two million bytes during shutdown and must exit
  cleanly before the receipt is accepted.

## Verification and limits

The check evidence is saved under ignored `.artifacts/task-workspace/review-*.log`.
The PostgreSQL instance is newly initialized, loopback-only, and uses an isolated
`raypx_review_test` database; no operator database is used. The large SQLite and
OS-lock tests create and remove their own temporary directories.

| Gate                                         | Result                                                                                                                                                                                    |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run verify`                             | 47/47 tasks; policy, formatting, i18n, strict checks, lint, tests, builds and Node/Cloudflare/standalone CLI artifact probes passed. API 84, CLI 163, Desktop 140, Web 61 tests.          |
| Node API with real PostgreSQL                | 15/15 passed, including malformed Unicode/continued ACKs, actual pruning SQL and bounded task/approval reads.                                                                             |
| Local Cloudflare worker with real PostgreSQL | 4/4 passed, direct and Hyperdrive adapters. The initial passwordless fixture URL was rejected by Miniflare; a synthetic local password field satisfied its configuration requirement.     |
| Isolated real Redis                          | 4/4 passed.                                                                                                                                                                               |
| Compiled Web/Desktop Chromium                | 25 passed, 2 explicit backend/live-AI gates skipped. Includes persisted sidebar state and the exact 760px tooltip boundary.                                                               |
| macOS arm64 native package                   | Built successfully, version 0.1.0, package hash `6wp873v56nex`.                                                                                                                           |
| macOS native smoke after shutdown fix        | Shell plus two restart/server-switch restore phases passed. Tray 32 × 22, `views://main` renderer/CLI bridge, persisted preferences and clean engine shutdown; no EPIPE in the final log. |

Windows CEF, real Docker/Traefik, production HTTPS/Cloudflare edge behavior and live
provider billing/resume behavior are not established by unit fixtures or a browser
preview. A local Cloudflare worker/PostgreSQL test is also distinct from edge traffic.

No deployed containers, production configuration or installed personal Desktop
profile are changed by this remediation pass.
