# Agent tasks and remote control

Design: [remote tasks](../../../docs/architecture/remote-tasks.md). Views: `@raypx/tasks`
([AGENTS](../../../packages/tasks/AGENTS.md)).

- Desktop's bundled CLI is the execution authority (Claude Code / Codex). API stores
  account-scoped read projections and relays commands; it never runs tasks.
- Path: Web/Desktop UI ↔ API relay (WSS) ↔ Desktop Native ↔ CLI (NDJSON over stdio).
  Native owns the outbound socket; no public port is opened.
- Remote creation, follow-ups, cancellation and approvals travel over the relay; HTTP
  RPC serves projections and one-time viewer tickets.
- Desktop defaults to "This computer" via private `agents.local.*` stdio methods.
- `@raypx/tasks/client` reads through TanStack Query, keyed by client and account;
  relay events invalidate queries while the page is visible.
  Shells import only `@raypx/tasks/client/pending-count`.
- Never render agent content as HTML or send local methods, paths or provider
  credentials to the API.
