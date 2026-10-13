# worker

## Purpose

The durable cloud Agent, notification and outbox execution host. It is a composition root for
long-running work and is never imported by Web, Desktop, or shared packages.

## Interface

| Path                            | Purpose                                                       |
| ------------------------------- | ------------------------------------------------------------- |
| `src/index.ts`                  | Outbox claim/dispatch loop and lifecycle contract             |
| `src/runtime.ts`                | Multi-instance composition and expired-owner recovery         |
| `src/cloud.ts`                  | Run dispatcher and execution-owner polling                    |
| `src/execution.ts`              | Execution-only orchestration, child agents and budgets        |
| `src/tools/`                    | Fixed trusted search, parsing, computation and document tools |
| `src/main.ts`                   | Single Bun entry: default Host and `--runner` mode dispatch   |
| `src/runtime-checks.ts`         | Compiled runtime and real document verification               |
| `src/runtime-check.config.json` | Deterministic samples, expected outputs and font defaults     |
| `vite.config.ts`                | Vite+ build orchestration and workspace resolution            |
| `nitro.config.ts`               | One Nitro executable and standalone runtime artifact          |
| `scripts/dev.mjs`               | Vite build watch and graceful Bun child restart               |
| `src/process-executor.ts`       | Atomic claim, lease renewal and child lifecycle               |
| `src/runner.ts`                 | Internal `startRunner` task mode and private Gateway          |

## Ownership

- Claim durable work using a lease and invoke an injected dispatcher.
- Failed outbox items use their persisted `attempts` for per-item exponential
  backoff: one second initially, capped at 60 seconds. Release carries the current
  lease identity and `retryDelayMs`; failures never make the whole batch sleep.
- `cloud.run.queued` persists acceptance before the outbox acknowledgement;
  an independent execution loop atomically claims the canonical CloudRun.
- Every host has a unique UUID. Recovery touches expired execution leases only.
  The host renews 30-second leases every ten seconds; expired owners cannot renew.
- Each Run executes in a separate Bun process with an explicit minimal
  environment and scoped RunGrant. Database, S3, model and search master
  credentials stay in trusted hosts. This is fault isolation; arbitrary code
  requires a future security sandbox.
- API Gateway bootstrap supplies trusted conversation history to Runner; API
  dispatches and meters actual model attempts and compaction.
- Runner receives only execution operations. Worker Host owns claiming, lease
  renewal, grant lifecycle and the overall deadline.
- Host forks its own executable with `--runner` after claiming. IPC readiness
  precedes bootstrap; mode selection does not initialize Host in the child.
- Host owns each Run's temporary directory and passes it in bootstrap. Execution
  requires that directory; Host removes it after child exit on every outcome,
  including forced termination that cannot run child cleanup.
- Linux/macOS use a detached POSIX group; Host force-kills remaining same-group
  descendants after every Runner exit before scratch cleanup. Windows fallback
  targets only the direct Runner process.
- Host owns the total deadline from the claim's `startedAt`, including grant setup
  and child/Pi initialization: Search 60 seconds, Computer `limits.taskDurationMs`.
  Abort is cooperative first; after two seconds Host force-kills if needed, waits
  for exit and revokes the grant. Timeout uses fenced `failed/BUDGET_EXCEEDED`
  completion; shutdown or owner loss uses interruption. Terminal Runs and newer
  owners remain protected.
- Operational logs correlate outbox, Run, execution and tool ids without input
  or output bodies. Sentry captures sanitized errors and fixed Run duration spans.
- Notification delivery rechecks current recipient access/preferences and global
  database mail configuration. Stable provider idempotency keys protect retries.
- Search has 60 seconds and six calls. Computer has 20 minutes per Run and 40
  calls per immutable TaskRound, with two concurrent children at depth one.

## Constraints

- Never read HTTP sessions or browser state.
- Never import React, route modules, or Desktop code.
- Acknowledge outbox items only after successful dispatch. Failures remain
  retryable and reported; a failed database release propagates and relies on
  lease expiry for recovery. Never auto-acknowledge or discard failed items.
- Shutdown stops new claims and waits for currently running handlers to finish.
- Pi receives only explicit trusted tools; never register built-in file, shell,
  dynamic extension, arbitrary MCP, browser or computer tools in this host.
- Registered names use Core's `CloudToolName`. Computer with delegation matches
  `cloudToolNames`; Search and child executions receive subsets, with no child delegation.
- A document batch becomes available only after every object verifies and the
  revision, terminal Run, Task review and notifications commit together.
- LibreOffice, Poppler and templates use fixed executable paths and argument
  lists, no shell or model code. The Debian image pins their snapshot and fonts.
- Vite+ and Nitro bundle workspace TypeScript into one `.output/server/index.mjs`.
  It defaults to Host and selects isolated execution with `--runner`. Worker uses
  a custom executable entry rather than an HTTP server; do not replace its
  lifecycle with a request handler.
- Nitro owns external dependency tracing and complete package assets through
  `traceDeps`. The artifact must run without the source checkout.
- Bundle React Email's asset-free runtime entry, keeping its preview CLI out of
  the artifact. Preserve full assets for external SDK/document packages.
- Turbo caches the complete `.output/**` artifact, including dependencies/assets.
  Use the root build gate so checks and dependency builds precede the build.
  There is no separate runtime-preparation task or package-copying pipeline.

## Verification

```bash
bun run --cwd apps/worker check
bun run --cwd apps/worker test
bun run build:worker
bun run --cwd apps/worker smoke
```

`bun .output/server/index.mjs --check-documents` additionally requires the production
fonts, LibreOffice and Poppler and verifies Chinese PDF/XLSX plus a real
eight-page presentation preview. CI runs it in the built Worker container.
Root `bun run verify` first relocates the complete `.output` outside the checkout,
then runs `--check` with a bounded Bun child process. Host's same-entry
`--runner --check` child validates Pi; the executable, shared chunks
and package assets must resolve from that isolated artifact.

`bun run dev` uses Vite's builder watch to rebuild bundled workspace sources.
After Nitro finishes packaging a successful build, it gracefully restarts the
compiled execution host using the current Bun executable. Failed builds do not
restart the host. Changes to installed dependencies or manifests require
restarting dev. See [tooling](../../docs/architecture/tooling.md) and
[ADR-0023](../../docs/architecture/decisions/0023-worker-vite-nitro-artifact.md) and
[ADR-0025](../../docs/architecture/decisions/0025-worker-single-entry-execution.md)
for the build and cache boundary.
