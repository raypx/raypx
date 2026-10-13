# Cloud platform

The target is [ADR-0016](decisions/0016-cloud-agent-platform.md), refined by
[ADR-0017](decisions/0017-gateway-and-task-rounds.md). Desktop scope is defined by
[ADR-0019](decisions/0019-retire-legacy-desktop-execution.md).

## Boundaries

Web composes Conversation, Task, file review, usage and notification pages.
Agent UI shares controlled business views. Client owns replay, contiguous event
sequences, reconnects and account/resource isolation. API authenticates every
command and subscription; Application checks current personal/project scope.
Worker claims Runs and starts separate Bun Runners with registered trusted tools.
Host and Runner share one compiled entry: default Host mode and `--runner`
task mode dynamically load their own composition. Task execution remains in a
separate process under [ADR-0025](decisions/0025-worker-single-entry-execution.md).
API's private execution Gateway dispatches model and research requests; only API
receives model/search credentials. Durable hashed RunGrants bind each Runner to
its scope, Run, owner epoch and live lease.
Both private SSE streams revalidate the original Better Auth session on every
poll, bypass cookie caching, and terminate on revocation, expiry or changed
identity. Application independently rechecks current account and project access.
This follows [Better Auth session management](https://www.better-auth.com/docs/concepts/session-management).

Rich Markdown and diff renderers are loaded by the browser. Compile-time SSR
guards exclude their worker/WASM dependencies from the Node server bundle;
the server renders readable content before those views load.

Core/Application/DB hold conversations, tasks, root/child executions, usage,
notifications and immutable artifact revisions. Object bytes belong to Storage.
API and Worker inject storage credentials; renderer code imports neither DB nor
Storage. Run events and model intents are durable, owner-fenced and idempotent.

Local filesystem objects stage bytes and metadata in one directory, then publish
both with an atomic rename on the same filesystem. Removal detaches the entire
object directory before deletion, so an overlapping upload cannot leave metadata
without bytes. Key-hashed paths keep prefix-related object keys independent.
Concurrent writers must agree on immutable bytes and media type. Existing flat
primary/legacy paths remain readable, and a matching retry can repair an old
unpublished write or metadata-only record without changing its declared content.

Each Worker host has a distinct identity. Run leases last 30 seconds and renew
every ten seconds. Recovery interrupts expired owners only. Runner processes
receive a minimal environment without DB, S3 or provider credentials. This is
fault isolation; arbitrary code still requires a security sandbox.

The private Gateway validates bootstrap, object, research and each execution
response against its contract. Runner consumes an execution-only port and gets
trusted conversation history from API Gateway bootstrap. API owns model metering
hooks; Worker Host owns claiming, renewal, grants and the overall deadline.
Identity and fencing come from the durable grant. Dispatch forbids identity
fields and replaces any supplied fence fields with that trusted context.
Host also owns the total deadline from the claim's `startedAt`, including grant
setup, child readiness and Pi initialization. Search has 60 seconds; Computer
uses `limits.taskDurationMs`. Timeout asks the child to abort, then force-kills
after the existing two-second grace if necessary. Host waits for exit before
revoking the grant. Timeout finishes an unfinished Run as `failed` with
`BUDGET_EXCEEDED` under its owner fence; shutdown or owner loss uses interruption.
Both paths protect terminal results and newer owners.
Host also owns a temporary directory per Run and passes it in bootstrap.
Execution requires that supplied directory; Host removes it after child exit on
success, abort or timeout, including force-killed children.
Linux/macOS use a detached POSIX group; Host force-kills remaining same-group
descendants after every Runner exit before scratch cleanup. Windows fallback
targets only the direct Runner process.
The API injects Core's canonical tool names into the model Gateway; Worker tests
verify its trusted registry matches that directory. SDK context and stream
events remain opaque, while a direct provider run requires usage hooks before
creating its session. Gateway transport uses API-owned metering.

Query owns ordinary Task/Round/Revision, usage, notification and file metadata.
Client Sessions own active Run/Conversation projections. SSR creates a QueryClient
per request. Durable message projections bootstrap bounded snapshots; earlier
events page independently. Confirmed commands and terminal transitions invalidate
precise resources without reconnecting streams. Visible usage refetches every 15
seconds so late settlement becomes visible without reopening finished Runs.

## Delivery

Report generators emit Markdown and PDF. Table generators emit XLSX and CSV
with literal values and formula-injection protection. Deck generators emit
PPTX and a real LibreOffice-converted PDF. Deliveries publish only after all
required files have been verified and uploaded. The user accepts the current
revision to complete a Task; retries retain history and produce a new Run.
Immutable TaskRounds freeze goals, attachments and a 40-call budget. Retry and
waiting-input continuation share that budget. A new goal creates a new round.
Acceptance compares current round, goal version and revision with no active Run.
Cancellation before publication prevents delivery; publication cannot be replaced
by cancellation. Signed downloads expire after 60 seconds; revocation prevents
new authorizations and clears local URLs, while issued URLs retain that lifetime.

## SaaS foundations

Usage counts actual model attempts, including children, retries and compaction.
Reservations are transactional; unknown token/cost reports remain explicit.
Search is bounded to six calls and 60 seconds. Computer Runs have 20 minutes;
main and child executions share their round's budget. Calls charge the resource
owner account, including project work with explicit spending permission. Defaults
are 100 calls per UTC month, two concurrent Runs and 100MiB storage. Dispatch is
atomically claimed once per intent. Late reconciliation changes the ledger only.
Application supplies the UTC `[monthStart, nextMonthStart)` window to the Core
transaction usage query. PostgreSQL aggregates through the current transaction;
memory returns the same totals. Released calls do not consume the call count,
but any recorded tokens and cost still contribute. Stored bytes include all
asset metadata until removal, and active Runs span all months. Fenced settlement
and trusted provider reconciliation share pure token/cost accounting while
keeping their authorization and event policies separate.
Redis applies short-window request limits; PostgreSQL owns quotas and execution
concurrency. Private S3 upload intents are bounded and checksum-verified.
Auth sessions, revocation, verification and policy read PostgreSQL directly.
Redis outages pause new production AI requests while history and logout remain
available. After an initial Redis connection failure, restart the API to restore
admissions once Redis recovers; already connected clients reconnect automatically.

Sentry and PostHog receive allowlisted metadata only. Product analytics are
explicit events, with no autocapture or replay. Fixed server flags govern new
runs; cancellation is a separate action. Task notifications use durable outbox
delivery, recipient preferences and typed bilingual mail templates.

Outbox delivery remains at least once. Worker uses each claim's persisted
`attempts` for exponential retry delay, starting at one second and capped at
60 seconds; release updates only that item's `availableAt`. Claims order eligible
rows by `availableAt`, `createdAt` and `id`, so a failing batch does not sleep the
whole consumer or starve healthy work. `OutboxLease` binds acknowledgement and
release to `id`, `workerId` and `attempts`, rejecting stale claim generations even
when a host identity is reused. Dispatch errors remain reported, and provider
idempotency keys remain stable. A database release failure propagates as an
infrastructure failure; lease expiry makes the item reclaimable. There is no
retry limit, dead-letter path or automatic acknowledgement of failed items.
Enqueue and schema stay unchanged; PostgreSQL owns consumption while the memory
Cloud repository continues to record transactional outbox writes only.

## Verification

Run owning workspace checks/tests, then `bun run verify`. PostgreSQL concurrency
and browser E2E use an explicit test database. Validate Bun Worker artifact
startup and real document exports separately from fake-provider tests.

Acceptance: research with citations, analyze CSV, produce a report/table/deck,
revise the same Task, accept its current revision, inspect notifications and
usage. Cover event gaps, duplicate delivery, owner fencing, cancellation races,
unknown model usage, permissions, storage failures and account switching.

See [cloud release acceptance](../development/cloud-acceptance.md) for recorded
local results and the remaining provider/deployment gate.
