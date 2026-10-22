# Observability

Logging uses `@raypx-kit/logger` (evlog wide events) with an explicit field policy.

- **API** (`apps/api/server/logging.ts`): one silent logger whose drain is wrapped in
  `withEventPolicy` and a drain pipeline; RPC events are emitted through it. Workers
  flush the shared logger per request without closing it.
- **CLI**: configures the logger once with a field policy and a stderr stream drain.
  Stdout stays protocol-only; log bounded IDs, status, `elapsedMs` and safe codes,
  never arguments, paths, output or raw errors.
- **Browser errors**: opt-in through analytics (see [analytics](analytics.md)).
- `/health` reports process liveness only and never queries PostgreSQL.

Not present yet: server-side error alerting, tracing, metrics dashboards or uptime
monitoring. Add them through Kit drains rather than ad-hoc logging.
