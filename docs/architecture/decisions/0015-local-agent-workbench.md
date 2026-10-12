# ADR-0015: Local Agent execution and shared business UI

## Status

Accepted.

## Context

Web and Desktop need the same conversation, tool, approval and artifact
semantics. Their SSR and native lifetimes differ. Existing Agent runs do not
identify a task or device and cannot recover progress from durable events.

## Decision

Keep Core, Application, Contracts and Client as separate ownership boundaries.
Add `@voidmix/agent-ui` for controlled Agent business views; applications keep
their routing, authentication, loaders, drafts and platform capabilities.
Base UI, shadcn Neutral and Phosphor remain the primitive system.

Desktop embeds a pinned Node runtime and Pi runner behind Rust commands and
ordered channels. Renderer code cannot import runner, provider or Node code.
The runner owns authorized tools, persistent Pi sessions, a SQLite journal and
device synchronization. The API authenticates devices, checks project access
and stores the canonical cloud run, command, event and artifact facts.
Worker owns durable delivery and scheduling, not execution of a local Run.
This refines ADR-0009 and replaces the Desktop cloud-client-only limitation.

Each Run belongs to one Task and one device. Retry creates another Run. A
device must durably accept work before tools start; accepted work may continue
offline. Outbox leases never transfer execution ownership. Events have a
unique `(runId, seq)` and are replayed from persistent storage. Only confirmed
execution facts change terminal state; a lost connection is not completion.

Use a new database and new clients. Existing project access, administration
guards and audit atomicity remain applicable; old client protocol compatibility
and business data migration are outside this rebuild.

## Consequences

- `agent-ui` accepts DTOs, actions and capabilities without importing transport,
  router, Pi, Tauri, SQL or application services.
- `client/runs` owns framework-independent snapshot, subscription and recovery.
  Connection disposal does not cancel a Run.
- Native grants and device credentials are host-owned. Cloud cancellation and
  permission changes take effect on an offline runner after reconnection.
- Production requires configured durable blob storage. Artifact upload state
  remains separate from execution success.
- Packaging validates the bundled Node and complete Pi dependency/resource
  closure; a user-installed Node executable is not a production dependency.

## Follow-up

Revisit execution ownership only when a migration protocol can stop the old
runner before transferring work. Extract additional UI packages only after two
production consumers require the same stable interface.
