# Agent workbench

The rebuild uses Account-first projects, a new database and coordinated new
clients. [ADR-0015](./decisions/0015-local-agent-workbench.md) records the
execution and UI boundaries. [Account-first](./account-first-v2.md) continues to
define ownership; project authorship never grants access.

## Ownership

Core owns rules and ports; Application owns use cases; DB owns PostgreSQL
transactions and repository implementations. Contracts owns runtime DTO
validation. Client owns requests and resumable streams. `agent-ui` owns
controlled presentation; Web and Desktop compose their own routes and shells.

Desktop has three separate surfaces: `src/` is the SPA renderer, `runtime/` is
the Node runner, and `src-tauri/` is its native authority and process host. Rust
uses narrow commands and ordered channels. Pi and Node never enter a renderer
bundle. Worker consumes the durable outbox and prepares device delivery; the
target Desktop executes the work.

## Run protocol

A Task expresses a goal. A Run is one attempt bound to a task and target
device. A retry creates a new Run and references its source. One task has at
most one nonterminal Run. Task completion is an explicit workflow decision.

The API provides device registration/revocation/binding, runner claim and
acknowledgment, run creation/retry, snapshots, paginated events, typed SSE,
idempotent commands and run artifact references. Device requests use a
dedicated credential; the API derives the device identity from authentication.
User commands require both project access and ownership of the target device.

The runner persists a claim before acknowledging it and starts tools only
after acknowledgment. It journals events before notifying the renderer or
uploading. The server confirms the highest contiguous sequence. Identical
retransmission is harmless; conflicting sequence contents are rejected.
Snapshot reads and their high-water sequence belong to the same consistency
boundary, and stream recovery starts after that sequence.

Heartbeat describes connectivity, not execution ownership. Accepted work can
continue offline. No lease expiry transfers an active Run to another device.
Cancellation of unclaimed work is atomic with claiming; cancellation of claimed
work stays pending until the runner confirms it. Completion wins over a late
cancel. Restart marks unfinished execution interrupted, preserves its journal,
and requires an explicit retry.

Pi `message_end` produces authoritative completed text. `agent_settled` and the
completed prompt lifecycle determine final execution state. Tool failure,
transport closure, blob upload failure and runtime failure have distinct
presentation. Model reasoning is represented as activity rather than private
reasoning content.

## Renderer and component state

`createRunSession` has no construction side effects. Mounted app features call
`reconnect`, subscribe through `useSyncExternalStore`, and dispose on scope
changes. Factories are scoped by account/project/task/run and are never shared
between SSR requests. Dispose closes subscriptions without cancelling work.
API streams use a separate link without read batching or a short request
timeout.

Applications own mutation pending state, route invalidation and input drafts.
`agent-ui` owns only local display interactions such as tool expansion,
artifact selection, follow-latest and focus. Platform capabilities receive
opaque file/artifact references; previews never read native paths themselves.
Tool details and content renderers are loaded through the host or private lazy
wrappers. Storybook fixtures remain deterministic test data, never production
fallbacks.

## Packaging and verification

`bun run desktop:prepare` downloads checksum-verified Node 24.18.0, bundles the
runner and copies the installed Pi dependency closure with its resources into
Desktop's ignored native runner resources. Tauri packages those resources.
Closing the main window hides it; quitting stops the runner.

Run each owning workspace's narrow test, then `bun run verify`. PostgreSQL
concurrency and browser E2E require an explicit test database. Native changes
also require Rust format/check/Clippy and an installer smoke. Verify sequence
gaps, duplicate delivery, account changes, approval/cancel races, interrupted
recovery and unconfigured providers. A live provider smoke requires configured
model credentials and is reported separately from deterministic fixture tests.
