# Persistent Agent Platform Roadmap

Status: In progress. Documentation reconciled 2026-11-05; live acceptance snapshot 2026-11-02. The Phase 1 first-delivery flow passed real Codex acceptance on macOS arm64; other platforms and the broader recovery matrix remain open. Phase dates beyond the first delivery goal remain planning estimates.

This roadmap describes the target product, not currently shipped behavior. The first phases intentionally reuse proven CLI, Desktop, storage, memory and scheduling components; later architecture remains open to evidence from those workflows. `PRODUCT.md` remains the description of the current product; [ADR 0039](architecture/0039-local-server-agent-platform.md) records the accepted target, and `PRODUCT.md` changes only as that target ships.

## Product Direction

Build a platform for persistent AI teammates. Each Agent has a durable identity, instructions, a continuous conversation, inspectable memory, work history, automations, and an authorized computer. A Run is one execution started by a user message or another trigger.

The implementation starts with one operating mode: a personal local instance backed by the existing CLI daemon. Reuse its `AgentRuntime`, `ManagedExecution`, provider adapters, `AgentTask` persistence, approvals, and SQLite journal; Desktop is only its control surface. The first acceptance uses one existing provider, Codex CLI. A server instance and linked local/server mode follow only after the local workflow is complete and exercised. Cloud initially runs the same CLI Agent Runtime headlessly; when an Agent is explicitly migrated, the server becomes authoritative. Pair a Desktop only when a server-owned Agent needs access to a local project. Web and desktop provide the first control surfaces; mobile follows after the core workflows stabilize.

Each Agent has exactly one authority. During the local-first phase, the local CLI instance owns the Agent, Runs, workspace, memory, credentials, model calls, approvals, and event history; nothing is synced implicitly. After an explicit export/import, a shared Agent belongs to the server instance; the server owns its configuration, conversation, Run state, approvals, model calls, and event history. A paired Desktop Host then exposes only scoped, revocable Computer/tools for selected projects and does not run a second copy of the shared Agent Runtime. Project files and raw terminal output stay on the Host. File content requested for a shared Run may transit through the server Runtime to the selected model provider, but is not copied into the server workspace by default. If the Host is offline, a migrated Run targeting its project waits or fails by policy; it never silently switches to a server workspace.

## First Delivery Goal

By 2026-11-10, validate one initially registered, offline-capable local flow through the existing Raypx CLI daemon on macOS or Windows: select a granted project, start a Codex-backed Run, read a project file, reject one read-only plan without any write, approve another plan before the provider writes and tests files, restart the daemon owner and reconnect Desktop, then continue the provider session without losing committed state. Plan approval is the write boundary for this flow: Codex enforces the read-only plan phase in its sandbox, and its run mode then writes inside the granted project without per-write prompts; only escalations it requests reach provider permission hooks. Raypx Agent Runtime and Run ownership stay local. Closing the Desktop window during a Run (Phase 3), cloud migration, local/server pairing, and container/VM isolation are outside this acceptance; Codex CLI may itself use its configured model service.

## Current implementation (2026-11-05)

Desktop uses MyGo 0.7.4 with Go 1.27.3 and the existing React SPA, while the
independent Bun CLI daemon owns execution on macOS/Windows. Local execution
requires one-time account/origin-bound enrollment, then supports offline use and
online logout. Codex, Claude and managed local Pi share the private CLI harness.
Provider adapters are consolidated in `@raypx/providers`; Core owns task-domain
rules and event-sourced orchestration commits effects and projections in SQLite
([ADR 0044](architecture/0044-event-sourced-cli-orchestration.md)). The independent
Relay handles opted-in remote coordination; API keeps read projections.

These source facts do not expand the dated live acceptance below. Server-owned
Agents, migration/pairing and the complete native mobile workbench remain targets.
The Expo Mobile workspace currently provides account/login only.

## Progress Snapshot (2026-11-02)

These percentages are rough effort estimates, not issue-count metrics. The complete six-phase product is about one-third implemented. The local-first delivery slice is about 90-95% implemented, with deterministic coverage and a passing real-provider acceptance on macOS. This does not establish Windows, foreground UI or the full effect-recovery matrix as passed.

| Phase                                    | Progress | Status                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------- | -------: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0. Deployment and ownership contracts    |     ~55% | Local ownership is documented, and local task inspection derives the Core Run status from persisted tasks and requests. Core transition rules now accept the local `waiting` to `cancelling` and `running` transitions; the Run manifest requires revisions local tasks lack, and the threat model, Attempt/effect state machines and failure-injection matrix remain open. |
| 1. Personal local vertical slice         |     ~95% | Synthetic lifecycle and read-projection coverage pass. Real Codex acceptance passed on macOS arm64, including plan rejection, plan-approved writes, daemon restart, session continuation and cancellation; Windows remains unverified.                                                                                                                                      |
| 2. Local tools, effects and approval     |     ~60% | Project grants, approval hooks, command receipts and duplicate-delivery protection exist; Codex run mode writes inside the granted project without per-write prompts. A consistent durable effect intent/result/uncertainty and reconciliation path remains incomplete.                                                                                                     |
| 3. Desktop-backed computer and memory    |     ~80% | The local daemon, granted project roots and revisioned memory UI are in place. Real macOS daemon restart preserves finished work; window close or restart during a running or waiting Run, and memory backup/restore checks, remain.                                                                                                                                        |
| 4. Automations and continuous local work |     ~40% | Local schedules support Cron, timezone, pause, preview and history, but local scheduled actions do not yet create Agent Runs through `AgentRuntime`. Cloud Agent schedules are separate and do not close this local phase.                                                                                                                                                  |
| 5. Explicit cloud migration              |     ~10% | Existing relay pieces may be reusable. Reviewed export/import, ownership transfer and headless server execution of the same CLI Runtime are not implemented.                                                                                                                                                                                                                |
| 6. Clients and extensibility             |     ~20% | Web/Desktop and multiple provider adapters exist. Client parity, mobile flows, MCP/connectors and safe configuration import remain.                                                                                                                                                                                                                                         |

The local synthetic lifecycle suite in `apps/cli/tests/integration/runtime/agents/host.test.ts` and the read-projection suite in `run-projection.test.ts` passed locally on 2026-11-02 (29 tests). Local detail returns `runStatus` without changing the persisted `AgentTask`; missing or mixed waiting request kinds fail explicitly.

Real acceptance passed on **2026-11-02 at 11:33 SGT**, on **macOS arm64**, using **codex-cli 0.165.0-alpha.1.2**. The separate native test application exercised read, reject-plan, approve-plan, write-and-test, restart-history, resume-session and cancel-process-tree. The daemon epoch changed across the explicit restart, and owned processes/session cleanup completed. Generated evidence is `.artifacts/native-agents/1793590421488.json`; it contains safe metadata and check names, without prompts or credentials. Claude, Windows and foreground interaction were not run.

`bun run verify` passed on the same source changes (24 successful tasks), including CLI's 385 tests, Desktop's 231 tests, the contracts consumer suite and the selected Go host checks. See [Agent acceptance commands](development/agent-quality.md#local-native-agent-acceptance).

## Near-Term Plan

The 2026-11-10 target is the local first-delivery flow, not completion of all roadmap phases. Keep the scope to one granted project and Codex CLI; do not start cloud migration, Host pairing, container isolation, MCP or mobile work before this gate passes.

1. **Local acceptance: passed on macOS.** The gate defaults to Codex; `RAYPX_LIVE_AGENT_PROVIDERS` optionally selects other configured providers. The recorded result above closes the first-delivery gate for this platform.
2. **Run read contract: connected.** `agents.local.get` uses Core's task-to-Run projection with the persisted pending/decided request kind. Runtime tests cover all mapped statuses, resolved and foreign requests, and ambiguous waits. `AgentTask` remains the sole stored lifecycle record.
3. **Acceptance defects: resolved for this flow.** The gate now uses the reserved device owner, waits for Desktop's existing engine startup and restarts its owned daemon through the CLI command. It preserves the product's version-mismatch replacement guard. Live denial, approved writes, restart/history, session continuation and cancellation passed. Broader uncertain-effect reconciliation remains Phase 2 work; this gate does not claim that matrix is complete.
4. **Affected delivery checks: passed.** The native gate and affected CLI/Desktop/contracts/Go checks passed. Distribution signing, Windows and foreground UI remain separate release gates.
5. **Core Run and provider foundation: implemented.** Core accepts waiting/resume/cancelling and owner-loss transitions. Codex/Claude adapters in `@raypx/providers` emit normalized conversation events through an injected SDK-compatible session factory. AgentTask remains the sole persisted Run. [ADR 0040](architecture/0040-instance-enrollment-and-providers.md) records the completed foundation scope, including first-time instance enrollment and offline identity; managed local Pi and the public task CLI are implemented in [ADR 0041](architecture/0041-provider-capabilities-and-pi.md).

With the macOS local gate passing and the Run contract reconciled, the next product increment is Phase 4's local Agent automation: add one scheduled Agent trigger through the same `AgentRuntime`, with idempotent delivery, visible run history, pause/resume and an explicit missed-trigger policy. Expand to migration and client extensibility only after that local workflow is proven.

## Architecture Target

```mermaid
flowchart TD
    D[Desktop] --> CLI[Raypx CLI daemon]
    CLI --> R[Existing AgentRuntime and ManagedExecution]
    R --> DB[(AgentStore and profile SQLite)]
    R --> P[Codex CLI provider]
    P --> W[Granted local project]
    D -. later .-> S[Single-instance server deployment]
    S --> HR[Same CLI AgentRuntime, headless]
    HR --> HDB[(SQLite on persistent volume)]
    HR --> HW[Server project root]
    HR -. optional local project access .-> HOST[Paired Desktop daemon]
```

- Keep the existing CLI daemon as the sole local runtime. Desktop sends commands over the current local protocol and owns no model, Run, approval, or tool state.
- Treat the existing `AgentTask` record as the first durable Run representation and `AgentStore` as its single source of truth. Reconcile the new Core Run contract with current task statuses; do not create a parallel Run table, execution registry, receipt store, or event journal.
- Reuse the profile SQLite database, command receipts, activity records, replay/snapshot code, `ManagedExecution`, project grants, provider approval hooks, local memory, and jobs scheduler. Add fields or states in place with migrations only where the local workflow exposes a concrete gap.
- The first Computer is a local profile, the independent CLI daemon, and one explicitly granted project root. It uses normal OS permissions; the grant scopes access but is not sandbox isolation.
- Use one existing provider adapter for first acceptance. Keep the existing adapter boundary, but defer adding providers, a generalized tool plugin system, and a new Tool Gateway until multiple real implementations need one.
- Local model/provider calls and any data they send follow the selected provider's connection and privacy behavior. Agent/Run ownership and local persistence remain on the device.
- After local workflows are proven, run the same CLI Agent Runtime in a headless single-instance server composition with a persistent SQLite volume. Keep server APIs and credentials at the composition boundary; do not add a second Agent Runtime or Agent persistence model.
- Make cloud migration an explicit reviewed ownership transfer. A server-owned Agent may use its server project; pair the Desktop daemon only when the user explicitly needs a local project. Pairing is outbound, scoped, revocable, idempotent, and recoverable from an acknowledged event cursor.
- Defer PostgreSQL for Agent state, horizontal Workers, multi-tenant scheduling, object-storage snapshots, and container/VM isolation until the single-instance deployment establishes a need and conformance requirements.
- Preserve explicit ownership, revocation, and uncertain-effect semantics at both local and server composition roots. Never claim exactly-once behavior for external side effects.

## Phases

### 0. Define Deployment and Ownership Contracts

- Define the local-first product scope, threat model, data ownership, startup/shutdown behavior, and recovery contract.
- Inventory the existing CLI `AgentRuntime`, `ManagedExecution`, `AgentStore`, local IPC, project grants, approval hooks, memory, and jobs. Name each as the initial owner instead of creating replacement modules.
- Treat `AgentTask` as the only persisted Run record for the first local version. Map its lifecycle to `agent-runs` statuses and add only missing transitions/fields in the existing store.
- Decide what may leave the device when a user explicitly selects a remote model or connector. Local mode requires first-time instance enrollment and then works offline without an active online session.
- Define the first Run input from fields already captured by `AgentTask`: prompt, provider/session, project grant, context snapshot and trigger. Defer a separate versioned Agent configuration until local workflows establish its shape.
- Define local Run, Attempt, effect, and approval state machines; event ordering and retention; and recovery when a model call or external effect has an ambiguous outcome.
- Establish deterministic local fakes and failure-injection scenarios for lost wakeups, lease expiry, process crashes, and duplicate tool delivery.
- Establish deterministic tests against the existing SQLite/runtime paths. Design PostgreSQL, migration, and Host pairing in a later phase; none blocks local completion.
- Start with one working implementation for each necessary runtime seam. Extract reusable adapter contracts as real variation appears; do not require a broad provider framework before the first vertical slice.

Exit criteria: the CLI daemon is the sole local authority; Run, approval, effect, and recovery rules are reviewable and testable without live providers; local execution after initial enrollment does not depend on an online session or PostgreSQL.

### 1. Personal Local Agent Vertical Slice

- Register the local instance once, then run the Agent platform offline. A Desktop-managed daemon owns the API, background execution, local SQLite database, and shutdown/recovery lifecycle.
- Keep the current CLI `AgentRuntime`, `ManagedExecution`, Codex adapter, task store and provider session as the execution path. Do not introduce a second runtime or first-class Agent database in this slice.
- Use the existing local task and follow-up flow as the first conversation/Run experience; preserve provider session continuity and project locking.
- Project the existing task lifecycle into the Core Agent Run vocabulary at read boundaries; keep `AgentTask` as the sole persisted status. Map `pending` to `queued` and `delivery_failed` to `failed`; resolve `waiting` from its pending request kind (`question` to input, `permission`/`plan` to approval), and reject ambiguous waits instead of guessing. Keep receipts, activity, approvals and replay in the existing SQLite journal.
- Verify Desktop-to-daemon create, stream, inspect, follow-up, disconnect and restart flows against synthetic providers before live-provider acceptance.
- Limit first acceptance to one configured provider, one granted project, a project read and a plan-approved write; the provider sandbox, not the prompt, keeps the plan phase read-only. Track usage through existing activity/provider paths where available.

Exit criteria: by 2026-11-10, the existing CLI daemon can complete the first delivery flow above offline after first-time instance enrollment, without an active online session or a running Raypx server; committed local state survives Desktop reconnect and daemon restart; ambiguous provider/effect outcomes are not replayed invisibly.

### 2. Local Tools, Effects, and Human Approval

- Reuse current project grants, provider permission hooks, local terminal approvals, confirmation paths and per-project execution locks.
- Harden the first approved write with durable effect intent, result and uncertainty records where the current path lacks them.
- Extend to one narrowly scoped command action only if the local workflow needs it; require explicit approval and retain current payload/revision checks.
- Never blindly replay an ambiguous effect; require inspection or reconciliation before another attempt.
- Defer a general-purpose Tool Gateway until tools execute inside Raypx or a second real tool implementation requires a common boundary.

Exit criteria: every local action is authorized by the local Agent instance; pending approval does not block unrelated conversations, and retries cannot silently repeat a completed or uncertain effect.

### 3. Desktop-Backed Computer and Memory

- Treat the existing CLI profile, daemon and explicitly granted project root as the first durable Computer. Its stable identity is the profile/project binding; its workspace is the user's existing directory.
- Keep the daemon independent from the Desktop window so closing the UI does not stop a Run. Reconnect and process restart recover the binding and Run history; they do not claim snapshot or VM restore semantics.
- The first-delivery gate restarts the daemon only after its Runs finish. Add live checks that a running Run continues while the Desktop window is closed and reconnects with its history, and that an owner restart during a running or waiting Run marks it interrupted without replaying effects.
- Reuse `packages/memory` and CLI `runtime/memory` for revisioned local context; add Agent-specific scope only when the local workflow requires it.
- Reuse existing profile backup/retention mechanisms for local records and artifacts; add missing restore checks without introducing object storage.

Exit criteria: a local Run can use the selected Desktop project after UI close/reopen and daemon reconnect; the project grant remains explicit and revocable; users can inspect and remove what the Agent remembers. Container or VM replacement remains a later phase.

### 4. Automations and Continuous Local Work

- Reuse the local `jobs`/Cron scheduler and make supported triggers create work through the same CLI AgentRuntime path as chat.
- Add routine versioning, test runs, pause/resume, trigger history, timezone handling, bounded/coalesced catch-up, and explicit missed-run policy.
- Add notifications for completion, failure, and requests for input; allow users to continue chatting while a Run waits for a decision.
- Add safe recovery and retry controls with visible attempt history and user-configurable automation budgets/limits.

Exit criteria: local triggers create Runs through the CLI daemon; trigger delivery is idempotent, missed or delayed work follows a documented policy, and every routine run is traceable to its trigger and result.

### 5. Explicit Cloud Migration and Server-Owned Agent

- Add reviewed export/import from the local CLI instance to a server-owned Agent. Exclude secrets and workspace content by default; let the user preview and select portable Agent configuration, memory, and history.
- Run the same CLI Agent Runtime headlessly as a single server instance with one persistent SQLite profile volume; keep the same task store, receipts, activity and provider adapters.
- Transfer ownership only after import succeeds. A migrated Agent is server-owned; the local copy is retained or retired according to an explicit user choice, never live-synced by default.
- Use a server project root as the first cloud Computer. Add Desktop Host pairing only when a migrated Agent needs a project that remains on the user's computer.
- If pairing is required, reuse the existing host/relay foundation where it fits and add only the missing grants, command receipts, cursor recovery and revocation fencing.
- Defer PostgreSQL Agent tables, horizontal Workers, multi-tenant limits and object-storage snapshots until measured scale or recovery needs justify replacing the single-instance profile.

Exit criteria: the same CLI Runtime can recover a migrated server-owned Agent after process restart on its persistent volume; ownership changes only after reviewed import; local data and secrets move only by explicit selection.

### 6. Clients and Extensibility

- Complete Web and Desktop parity across local and server instances; add mobile control and notification flows.
- Introduce the deferred Tool Gateway for MCP and selected application connectors, with credentials isolated from model context.
- Add import from common Agent configuration formats with preview, explicit selection, and executable content disabled by default.
- Add more model and Computer providers through conformance-tested adapters.

Exit criteria: supported clients expose the same durable state and authorization behavior; importing or changing providers cannot silently broaden an Agent's access.

## Deliberately Deferred

- Multi-Agent delegation and shared Agent teams.
- A large integration catalog or public plugin marketplace.
- Voice calls, visual workflow builders, and broad messaging-platform support.
- Multiple Computer providers before one provider's lifecycle, isolation, and recovery contract is proven.
- A second Agent Runtime, parallel AgentRun persistence table, duplicate event journal, or generalized orchestration framework.
- PostgreSQL for Agent records, horizontal Worker fleets, and multi-tenant server execution before the single-instance CLI deployment is proven.
- Container or VM isolation for Computer execution before the Desktop-backed Host contract and effect recovery are proven.
- Microservices, a mandatory Redis deployment, or a separate workflow engine before measured operational needs justify them.
- Transparent synchronization of local-only Agents before conflict, offline, and ownership semantics have a concrete need and design.

## Technical Principles

- One Agent Runtime implementation and one persisted Run source at a time. The CLI daemon owns local work; the same runtime runs headlessly after explicit server migration.
- One canonical owner for each durable Agent and Run. After migration the server owns the Agent; a paired Host owns only granted local execution state.
- Every model-visible tool is enforced by the owning instance's authorization and effect path. A paired Host adds a second local grant check before touching a local project.
- A Desktop-backed Computer is a trusted user-host process with normal OS permissions, not a sandbox. Never describe its project grant as container isolation; add a separate isolation provider when the threat model requires it.
- Never treat prompt instructions as a security control. Scope, approval, secret access, and computer isolation are enforced outside the model.
- Do not claim exactly-once behavior for external systems. Use durable intent, idempotency where supported, and explicit uncertain outcomes.
- Keep tests deterministic and offline by default. Run provider-specific acceptance separately from core state-machine and adapter conformance tests.
- Measure queue delay, time to first useful response, recovery time, effect uncertainty, and computer restore success without logging prompts, credentials, paths, or file contents.
