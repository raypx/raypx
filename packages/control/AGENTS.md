# @raypx/control

Shared account/device control-plane services for API and the independent Relay.
The root exports ControlService and its injected context resolver. `/postgres`
owns control and account-context persistence; `/relay` owns bounded private broker
transport, socket routing and scheduling ports. `/testing` is test-only.

Applications supply database connections, lifecycle and authorization entry points.
Never import an application. Preserve device/session fencing, one-time viewer
tickets, bounded replay, owner-scoped transactions and uncertain delivery semantics.
Credentials and task/context bodies must not enter logs. SQL/schema migrations
remain owned by Database; this extraction changes no persisted formats.

Unit tests live beside source; run local `check`, `test`, and root `bun run verify`.
