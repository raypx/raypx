# @raypx/jobs-server

Injected Node cloud scheduling use cases and repository/dispatch ports. API and
Control consume this workspace; API owns timers, persistence and concrete dispatch
adapters. Keep it independent of browser views, UI and transport contracts.

Cloud actions are device.sync and agent.run, scoped to an account and captured device
epoch. No server action may execute arbitrary shell commands. Persist occurrence and
run IDs before dispatch; keep overlap protection until task projections reach a
terminal state. Unknown delivery pauses the plan and is never automatically resent.
Creation requests retain their UUID until confirmed, and manual runs retain a
separate immutable request/run ID.

Run `bun run --cwd packages/jobs-server check` and `test`.
