# Opt-in browser analytics

`@raypx-kit/analytics` owns the consent-controlled PostHog client and optional React
bindings. `@raypx/analytics` owns Raypx event schemas, static surface metadata,
mutation decorators and shared settings. Application composition roots inject
configuration, identity and preference stores. API/Native/CLI collection and
session recording are outside this first integration; evlog remains unchanged.

## Consent and identity

Usage statistics and error reports default off and are independent device choices.
Web restores localStorage after hydration; Desktop reads current Native analytics
preferences through a five-second RPC and saves only analytics through its own RPC.
Capture stays disabled until the read completes; startup preload is not an authorization source.
Missing/failed
Native reads never fall back to stale WebView consent. Legacy preference files
have both categories disabled. Theme/locale writes preserve analytics fields.
SDK loading is deferred until an enabled category is used. Disabled/unconfigured
builds never send diagnostics, and pre-consent events are not queued for later.

Usage consent enables internal-account identification across Web and Desktop.
Email, name and account profile attributes are not sent. Logout/account changes
reset the identity. Errors-only mode remains anonymous. Revocation stops new
capture and aborts pending requests; it does not delete events already delivered to PostHog. Failed preference
writes do not enable a new category and leave an explicit retry message.

## Events and errors

Explicit events are `app_opened`, `page_viewed`, `sign_in_succeeded`,
`task_create_result`, `approval_submit_result`, `task_scope_changed` and `query_failed`. `query_failed`
reports a failed remote read (query family, safe code, API request ID) at most once per
minute per family, so failures can be matched to the API logs.
A create result means accepted/failed operation attempts, not completed execution.
Reads, retries by Query and relay invalidations do not emit mutation results.
Page identifiers and enum properties are projected through an allowlist, both
before capture and after SDK enrichment. SDK URL/referrer/person enrichment is
removed. Local tasks contribute only consented operation counters; task IDs,
prompts, files, paths, answers, terminal output and credentials never enter events.

Unhandled errors/rejections, React boundaries and router catches use one sanitized
error path. Error messages become safe codes. Only application `/assets/*.js`
frames from the current HTTP(S) or `views:` origin survive; local paths, query
strings, causes and other frames are discarded. Source-map chunk/release IDs remain.
Autocapture, automatic pageviews, flags, console/network capture and replay are off.
The SDK uses its no-external bundle and loads no remote feature scripts.
It formats events but never dispatches them: the package sends only the final safe
payload through a single fetch with a ten-second timeout, no credentials/referrer,
keepalive, retries, offline queue or unload beacon. SDK persisted opt-out state is
reconciled with current application consent after initialization.
Both applications import the shared analytics stylesheet to register its Tailwind sources.

## Configuration and source maps

Both apps accept public build values `VITE_POSTHOG_PROJECT_TOKEN` and
`VITE_POSTHOG_HOST` (the ingestion host for your PostHog region). Missing either
leaves the controls disabled with an explanation. Root build commands supply
`VITE_APP_RELEASE` from the Git commit unless explicitly set; verification, test and
E2E runs use the fixed `verification` so their caches survive commits. Keep that same
value through the entire release. `RAYPX_SOURCEMAPS=1` enables hidden client maps and is
part of the build cache key. No upload credentials use a `VITE_` name.

For example, build Web with `RAYPX_SOURCEMAPS=1 bun run build:web`, then run
`bun run analytics:sourcemaps web` with `POSTHOG_CLI_HOST` (PostHog UI host),
`POSTHOG_CLI_PROJECT_ID` and secret `POSTHOG_CLI_API_KEY` in the release environment.
For Desktop use `build:desktop` and the `desktop` target. The command injects release
and chunk metadata, uploads maps, and removes maps after success. It fails when
credentials/maps are missing; ordinary builds and verification require neither.

Publish those same injected outputs. For Desktop, run the workspace `native:build` after injection; do
not run root `package:desktop`, which rebuilds the renderer. Do not publish outputs
from a failed upload or serve hidden maps accidentally.

`@raypx-kit/analytics` is pinned to an exact published alpha; update it through the
[library workflow](../development/intl-release.md).

## Verification

Kit tests exercise consent, real SDK requests, sanitizer boundaries, StrictMode and
SSR imports, including packed consumers without React. Raypx tests exercise enum
policies, preference failures, native persistence and actual mutation callbacks.
Browser tests use a mock ingestion endpoint and synthetic account data; no real
user information or PostHog project is needed. A real release still needs configured
PostHog credentials to verify ingestion and original-source resolution in its UI.
Packaged Native WebView acceptance is separate from browser renderer checks.
