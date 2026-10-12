# Voidmix domain language

This glossary defines the current cloud platform described in
[ADR-0016](docs/architecture/decisions/0016-cloud-agent-platform.md). Earlier
Workspace/device execution designs remain historical reference material.

## Identity and scope

- **Actor** — the authenticated user or trusted host performing an operation.
  A model cannot choose an actor, ownership or permission scope.
- **Account** — a user's personal ownership and quota boundary.
- **Scope** — explicitly personal (`ownerUserId`) or project (`projectId`).
  Personal ownership comes from authentication; children inherit the root scope.
- **Project** — account-owned work with explicit project members and capabilities.
  An organization membership can restrict the member's effective permissions.
- **Capability** — permission for a particular operation, checked against current
  account, project and organization facts. Membership is not an unrestricted grant.

## Conversations and work

- **Conversation** — a scoped history of user inputs and their execution attempts.
- **Turn** — one user input with its prompt, mode, authorized file references and
  idempotency key. Repeating a request returns its original Turn and Run.
- **Search** — research using actual sources, excerpts and attributed answers.
  Search can have a Conversation and Run without creating a Task.
- **Computer** — background work with trusted tools and reviewable deliverables.
  Browser, GUI and arbitrary code execution require later designs.
- **Task** — a goal the user can review and accept. It can be personal or belong
  to a Project; creating a Project is not a prerequisite.
- **Task status** — `open`, `in_progress`, `waiting_input`, `review`, `completed`
  or `cancelled`. Accepting the current delivery completes the Task.

## Execution

- **Run** — one bounded attempt, optionally linked to a Task. Retry creates a
  new Run with its attempt and origin; it does not overwrite the prior attempt.
- **Run status** — `queued`, `running`, `needs_input`, `succeeded`, `failed` or
  `cancelled`. Run success alone does not complete a Task.
- **Agent execution** — the main Agent or a child with its own context. Children
  inherit scope and share the Task budget; they cannot delegate further.
- **Tool execution** — a trusted named operation with durable input/result and
  execution identity. Unknown external effects are not automatically replayed.
- **Run event** — a root-Run event with ordered sequence, occurrence time and
  payload; child events include their execution identity. A subscription cursor
  joins snapshot, history and live delivery without dropping events.
- **Run command** — a durable, idempotent cancellation or steering request with
  an execution result. Disconnecting the client is not cancellation.
- **Delivery lease** — a Worker claim on an outbox record. Acknowledging it means
  the execution intent was durably accepted, not that the Run has completed.
- **Execution owner / epoch** — the host ownership fence rejecting old writers.
  A lost heartbeat alone does not authorize replaying unknown tool effects.
- **Source evidence** — an actual source URL, title and excerpt associated with
  a Run and used to support citations.

## Files and review

- **Asset version** — an immutable scoped file version with size and checksum.
  Upload intent, verified bytes and publication are distinct states.
- **Object** — private file bytes in object storage, separate from DB metadata.
  A successful object transfer does not publish a delivery.
- **Artifact set revision** — the complete file collection for one delivery.
  Its publication, Run result, Task review state and notification intent commit
  atomically. The user accepts the current Revision, not an obsolete version.

## Usage and records

- **Usage ledger** — durable model/tool/storage usage facts. Model attempts,
  retries and compaction consume real quotas; logs and Redis are not the ledger.
- **Reservation** — quota held before a physical model call. Confirmed unstarted
  calls release it; unknown started calls remain explicitly unknown and estimated.
- **Notification** — a durable user-facing state change with read state and
  optional email delivery governed by current preferences and permissions.
- **Outbox event** — a fact committed with business state and later delivered.
- **Audit event** — a durable record of sensitive administration, separate from
  operational logs and product analytics.
- **Idempotency key** — caller-provided command identity. Reuse with a different
  payload conflicts; an HTTP retry does not create another effect.

## Boundaries

Core owns rules and ports. Application coordinates use cases and transactions.
Adapters implement database, storage, model and mail access. Contracts define
public protocol; Client owns transport and replay. Applications own routes,
account/resource lifetimes, drafts and platform access. Agent UI receives
controlled facts and actions and owns only local presentation state.
