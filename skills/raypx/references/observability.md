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

- **API error reports**: with `POSTHOG_PROJECT_TOKEN`/`POSTHOG_HOST`, error-level and 5xx
  events go to PostHog error tracking after the field policy (`server/error-reports.ts`).
  Alert rules live in PostHog.
- **Correlation**: request IDs (`req_` + 24 letters) appear in API responses, logs, server
  error reports and browser `query_failed` events.
- **Readiness**: `/ready` checks PostgreSQL and Redis; `/health` is liveness only.

Not present yet: tracing, metrics dashboards, SSR/CLI error reports and uptime monitoring.
