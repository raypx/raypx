# Remaining Agent platform work

This is the remaining product direction, not a shipped-feature list or a dated
acceptance report. [Product scope](../PRODUCT.md) and the
[current architecture](architecture/README.md) describe the implementation;
[ADR 0039](architecture/0039-local-server-agent-platform.md) records the longer-term
ownership model. Release evidence belongs to the exact candidate and platform,
using the [testing gates](development/testing.md).

## Current foundation

The independent Bun CLI daemon owns local sessions, processes, approvals,
scheduling and profile SQLite. Desktop is its Tauri/Rust client. One-time
account/origin-bound enrollment permits subsequent offline work. Claude, Codex
and device-local Pi use the private CLI harness; `AgentTask` remains the persisted
Run record. Remote opt-in exposes scoped device work through Relay and API read
projections; it does not transfer Agent ownership to the server.

The following work extends these boundaries. It does not require rewriting the
CLI/daemon, adding a second execution engine or introducing a separate Run store.

## Next increment: local Agent automations

Local Cron jobs currently run directory scans or process commands. Connect a
scheduled Agent trigger to the same `AgentRuntime` used by interactive sessions.
Reuse project grants, provider approvals, frozen context and the existing journal.

Acceptance requires:

- Idempotent trigger delivery and a visible link from the schedule to its Run.
- Pause/resume, timezone handling and an explicit missed-trigger policy.
- Bounded catch-up, traceable attempts and safe cancellation.
- Deterministic offline tests before separate live-provider acceptance.

## Recovery and local acceptance

Extend failure injection around the existing receipt, approval, effect-intent and
projection transactions. Uncertain external effects must remain inspectable and
must never replay automatically after restart. Test duplicate delivery, process
loss during a pending decision, interrupted writes and reconnecting event cursors.

Exercise long-running work while Desktop is closed, reconnect to the same daemon,
and verify explicit daemon stop drains owned processes. Test history and memory
backup/restore separately from process recovery. A granted project is a directory
on the user's computer with normal OS permissions; it is not a container sandbox.

Expand the same acceptance scenarios on macOS and Windows. Source checks and
synthetic providers do not establish live-provider, installed GUI, signing,
notarization, upgrade or updater acceptance. Follow the
[Agent acceptance guide](development/agent-quality.md) and
[Desktop release guide](development/desktop.md#build-and-release).

## Later: explicit server ownership

After the local workflow is proven, support reviewed export/import into one
headless instance of the same CLI runtime with a persistent SQLite profile.
Preview portable configuration, memory and history; exclude secrets and project
content by default. Change ownership only after import succeeds and the user
chooses whether to retain or retire the local copy. Do not silently synchronize
two authorities for the same Agent.

Start with a server-owned project. Pair a Desktop only when that Agent needs a
local project, using scoped, revocable grants and acknowledged cursor recovery.
An unavailable Host must wait or fail explicitly rather than switching workspaces.
The server owns the migrated Run; the paired Host owns only its granted local
execution. These are future capabilities, separate from current remote access.

## Later: clients and extensibility

- Extend Web/Desktop parity to supported local and server instances; Mobile is
  currently an account/login baseline, not a complete task workbench.
- Add MCP/connectors when actual consumers establish a shared tool boundary.
- Import Agent configuration only with preview, explicit selection and executable
  content disabled by default.
- Add providers through adapter conformance tests without broadening grants.

Defer Agent teams, a public plugin marketplace, horizontal workers, multi-tenant
Agent storage, object-storage snapshots and container/VM execution until concrete
workflows establish their need. Never treat prompt instructions as authorization
or claim exactly-once external effects. Measure response and recovery behavior
without logging prompts, credentials, private paths or file content.
