# @voidmix/worker

## Purpose

The durable cloud Agent, notification and outbox execution host. It is a composition root for
long-running work and is never imported by Web, Desktop, or shared packages.

## Interface

| Path                      | Purpose                                                       |
| ------------------------- | ------------------------------------------------------------- |
| `src/index.ts`            | Outbox claim/dispatch loop and lifecycle contract             |
| `src/runtime.ts`          | Multi-instance composition and expired-owner recovery         |
| `src/cloud.ts`            | Cloud execution owner, cancellation, child agents and budgets |
| `src/tools/`              | Fixed trusted search, parsing, computation and document tools |
| `src/main.ts`             | Node executable and compiled runtime/document verification    |
| `scripts/dev.mjs`         | Initial build, source watch and Node child restart            |
| `src/process-executor.ts` | Atomic claim, lease renewal and child lifecycle               |
| `src/runner-main.ts`      | Credential-free per-Run Node entry and private Gateway        |

## Ownership

- Claim durable work using a lease and invoke an injected dispatcher.
- `cloud.run.queued` persists acceptance before the outbox acknowledgement;
  an independent execution loop atomically claims the canonical CloudRun.
- Every host has a unique UUID. Recovery touches expired execution leases only.
  The host renews 30-second leases every ten seconds; expired owners cannot renew.
- Each Run executes in a separate Node process with an explicit minimal
  environment and scoped RunGrant. Database, S3, model and search master
  credentials stay in trusted hosts. This is fault isolation; arbitrary code
  requires a future security sandbox.
- The API Gateway dispatches and meters actual model attempts and compaction.
- Operational logs correlate outbox, Run, execution and tool ids without input
  or output bodies. Sentry captures sanitized errors and fixed Run duration spans.
- Notification delivery rechecks current recipient access/preferences and global
  database mail configuration. Stable provider idempotency keys protect retries.
- Search has 60 seconds and six calls. Computer has 20 minutes per Run and 40
  calls per immutable TaskRound, with two concurrent children at depth one.

## Constraints

- Never read HTTP sessions or browser state.
- Never import React, route modules, or Desktop code.
- Every claimed item must either be acknowledged or have its lease expire for a
  later worker to reclaim it.
- Shutdown stops new claims and waits for currently running handlers to finish.
- Pi receives only explicit trusted tools; never register built-in file, shell,
  dynamic extension, arbitrary MCP, browser or computer tools in this host.
- A document batch becomes available only after every object verifies and the
  revision, terminal Run, Task review and notifications commit together.
- LibreOffice, Poppler and templates use fixed executable paths and argument
  lists, no shell or model code. The Debian image pins their snapshot and fonts.
- Build bundles workspace TypeScript and copies third-party runtime assets with
  their dependency graph; the artifact never requires the source checkout.

## Verification

```bash
bun run --cwd apps/worker check
bun run --cwd apps/worker test
bun run build:worker
bun run --cwd apps/worker smoke
```

`node dist/index.mjs --check-documents` additionally requires the production
fonts, LibreOffice and Poppler and verifies Chinese PDF/XLSX plus a real
eight-page presentation preview. CI runs it in the built Worker container.

`bun run dev` builds the runtime dependency closure once, then watches bundled
workspace sources and gracefully restarts the real Node execution host. Changes
to dependency manifests require restarting dev to refresh runtime packages.
