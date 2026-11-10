# @raypx/control

Shared account/device control-plane services for API and the independent Relay.
The root composes ControlService and its injected context resolver. `/postgres`
owns device/relay persistence; `/relay` owns bounded private broker
transport, socket routing and scheduling ports. `/testing` is test-only.
Within `/relay`, `RelayHub` is the public facade, socket lifecycle and frame dispatcher;
`registry.ts` owns shared socket/route state, `frames.ts` one handler per client frame
in a role-keyed table, and `dispatch.ts` job dispatch and cluster-forwarded operations.

Applications supply database connections, lifecycle and authorization entry points.
Never import an application. Preserve device/session fencing, one-time viewer
tickets, bounded replay, owner-scoped transactions and uncertain delivery semantics.
Credentials and task/context bodies must not enter logs. SQL/schema migrations
remain owned by Database; this extraction changes no persisted formats.

Unit tests live beside source; run local `check`, `test`, and root `bun run verify`.

ControlService exposes credentials/projects/commands/tasks/observed groups without
forwarding methods. Tasks/server owns the task projection and stored task/event/request
schemas. `task-ports.ts` injects owner-scoped readers, device authorization transactions,
connection release and error mapping; context dispatch receipts are released in that
same transaction. Memory/server/postgres owns account-context persistence. Project
validation is independent of context resolution, so compose projects, Memory, then commands.
