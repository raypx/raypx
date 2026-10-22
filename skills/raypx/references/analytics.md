# Analytics

Packages: `@raypx/analytics` ([AGENTS](../../../packages/analytics/AGENTS.md)) on top of
`@raypx-kit/analytics` (PostHog). Design: [analytics](../../../docs/architecture/analytics.md).

- Usage statistics and error reports are separate device choices, both off by default.
  Web stores consent in localStorage; Desktop stores it through Native RPC.
- Events are allowlisted in `eventPolicy` (`packages/analytics/src/index.ts`):
  `app_opened`, `page_viewed`, `sign_in_succeeded`, `task_create_result`,
  `approval_submit_result`, `task_scope_changed`. Only enum properties survive.
- Never add task IDs, prompts, files, paths, URLs or account profile attributes.
- `instrumentTaskClient` reports mutation attempts (accepted/failed), not completion.
- Configure `VITE_POSTHOG_PROJECT_TOKEN` and `VITE_POSTHOG_HOST`; without them the
  controls stay disabled. `VITE_APP_RELEASE` comes from the Git commit.
- Readable stack traces: build with `RAYPX_SOURCEMAPS=1`, then
  `bun run analytics:sourcemaps <web|web-cloudflare|desktop>` with `POSTHOG_CLI_*`.
