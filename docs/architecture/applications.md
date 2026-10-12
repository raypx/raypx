# Applications

This document describes what each application is for, how it is built, and how
it is deployed. Each application's own `AGENTS.md` owns its interface,
constraints, and verification commands; keep those details there rather than
duplicating them here.

## Web

`apps/web` is the public/product-facing TanStack Start application and the
browser composition root for authentication and Admin operations.

- Uses `@voidmix/ui` and controlled `@voidmix/agent-ui` views; owns Web routes,
  metadata, SSR and content. Search/Computer live at `/chat` and Task deliveries
  at `/tasks`; file review, notifications and account usage use the cloud API.
- Serves `/manifest.webmanifest` through a TanStack Start server route with the
  VoidMix name, launch scope, theme, and shared 512×512 brand mark for
  install-capable browsers.
- Route files declare URLs and own single-route pages, including the canonical
  project list/detail. Shared Auth and Admin features remain separate; the home
  route mounts the public marketing page and its navigation.
- Feature roots keep components, state, data, fixtures, tests, and styles;
  larger features place internal presentation components under a local
  `components/` directory.
- Home navigation offers English/Simplified Chinese switching at desktop and
  mobile widths. The menu loads on interaction, and the root i18n provider keeps
  the chosen locale across reloads using the existing locale Cookie.
- Authentication pages are grouped under `(auth)/route.tsx` and expose public
  `/login`, `/signup`, `/reset-password`, and `/verify-email` URLs. Login and
  signup validate an internal `redirect` search parameter so protected
  navigation can return to its original destination without creating an open
  redirect. Signup also gives Better Auth a same-origin verification callback,
  so the email flow returns to the Web verification state before the user signs
  in.
- `(app)/route.tsx` resolves the account through the API before protected
  loaders. Project list/detail and Admin directory own remote data in loaders,
  with request cancellation and mutation invalidation. SSR creates a client
  per request; account changes hide stale data and clear protected caches.
- Admin URL search owns server filters and pagination. A page-scoped Zustand
  store owns selection, pending IDs and message descriptors. It holds no user
  entities and never persists. Preview adapters are only explicitly injected in
  tests. The API remains authoritative for permissions and audits.
- Public Auth pages consume a separate three-boolean capability view and fail
  open when it cannot be loaded; authentication and mail settings retain their
  server-side inheritance. Retired settings administration routes stay absent.
- Admin-specific adapters, tables, filters, and layouts stay isolated under
  `apps/web/src/features/admin`; fusion removes a deployment unit without
  turning those modules into public-home concerns.
- Runs on port `3000` in development.
- Produces a TanStack Start server bundle and a browser bundle.
- Resolves locale from the `locale` Cookie, `Accept-Language`, then English; the
  document and React provider share the loader result for hydration safety.
- Loads only the resolved Web locale catalog before SSR through the root loader
  and mounts it with `AsyncI18nProvider` from `@voidmix/i18n`. The Web-owned
  loader map dynamically imports the other locale on language switch; feature
  components select namespaces through the facade. Recovery pages retain their
  independent static copy.
- Calls the standalone API origin through the shared typed client with
  credentialed cookie requests; it does not mount API handlers.
- Conversation/run sessions are scoped by account and resource. The app owns
  drafts and pending mutations, releases subscriptions on navigation and rejects
  late responses. Private routes are noindex and excluded from the public sitemap.
- Admin adds `/admin-runs` for status, owner fencing and usage inspection.
  Operational reads do not expose private prompts, results or file contents.
- The API owns `DATABASE_URL`, Auth, mail, Redis, and persistence composition.

## Desktop

`apps/desktop` is a Tauri 2 application with a TanStack Start SPA renderer.

- Shares `@voidmix/ui`, `@voidmix/client`, and `@voidmix/contracts`.
- Uses Start file routing and SPA mode with RSC disabled. The Start server build
  is used only to prerender `dist/client/index.html`; Tauri embeds that client
  directory and does not ship a JavaScript server runtime.
- Resolves locale from localStorage, `navigator.language`, then English after
  hydrating the deterministic English build-time shell, and switches
  synchronously against the statically mounted catalog.
- Uses Start's automatic route component splitting so page code loads separately
  from the shell and shared static catalog.
- Desktop navigation exposes Home, Projects, Activity, and Settings. Devices
  remains available from Settings. Home, Devices, and Project pages read data
  through client-only route loaders, with shared pending and retry states.
- Project creation and overview refresh invalidate the owning route. Route
  cancellation reaches the API transport, and late responses cannot replace
  a newer navigation. Activity filters live in validated URL search parameters.
- Zustand owns renderer preferences shared across pages: theme, sync pause, and
  the five settings toggles. Each control subscribes to the value it uses;
  transient form fields remain local and remote data remains in route loaders.
  The shell restores preferences after hydration so the prerendered document
  starts deterministically. Persistence validates saved values, migrates the
  previous theme key, and tolerates unavailable localStorage. These values are
  renderer preferences; saving a toggle does not itself configure an OS service.
- Owns no Start server functions or server routes. Runtime data continues to
  come from the cloud API through `@voidmix/client`.
- Rust owns tray behavior, notifications, window lifecycle, and native
  commands.
- Single-route pages live beside their route declarations; route-only formatting
  helpers and tests use the ignored `-` prefix. The shared Desktop shell remains
  in `src/features/shell/`. See
  [ADR-0011](./decisions/0011-colocate-single-route-pages.md).
- Closing the main window hides it to the tray; the tray can show, hide, or
  quit the application.
- The first release targets macOS and Windows.
- The first version is cloud-backed and does not provide offline sync.
- `src/lib/projects.ts` uses the account-first V2 Project procedures for
  authenticated project listing, creation, and detail reads; page components
  do not own transport or validation. Project pages show unavailable states when
  the API is absent; overview and device data retain their existing preview fallback.
- Routes use directories for URL segments: `route.tsx` defines the segment,
  `index.tsx` its index page, and `$projectId.tsx` the dynamic child. The
  `projects/route.tsx` layout renders an `Outlet` for the list and detail views.
  Missing projects have a route-specific
  not-found page with a link back to the list.

The native seam lives in `apps/desktop/src-tauri/src/lib.rs`. Desktop accesses
Agent capabilities through the API and does not embed the server-side AI
adapter.

## Worker

`apps/worker` is the durable cloud Pi host for Agent and outbox work.

- Durably accepts `cloud.run.queued` intent before acknowledging the outbox.
  A separate owner-fenced executor performs the run; delivery does not mean
  model or tool execution has completed.
- Runs one main Pi Agent and at most two children with a shared Task budget.
  Registers only trusted research, extraction, calculation, document rendering
  and delegation tools. Built-in shell/files, dynamic extensions and arbitrary
  MCP startup remain disabled.
- Publishes validated Markdown/PDF, XLSX/CSV and PPTX/PDF deliverables through
  the same atomic revision workflow used by the API.
- Owns opt-in notification mail and expired upload cleanup. Provider effects
  remain outside SQL transactions, with durable intents and completion checks.
- Shares application commands with the API without importing HTTP sessions or
  UI state.
- Stops claiming on shutdown; unacknowledged work remains reclaimable after its
  lease expires.

## Storybook

`apps/storybook` is the development workbench for `@voidmix/ui` primitives.

- Runs on port `6006` in development.
- Owns component stories and visual documentation, not product routes or API
  calls.
- Loads the shared Tailwind v4 tokens and `packages/ui/src/styles.css` so
  stories exercise the same design system as the applications.
- Provides a Light/Dark toolbar backed by `@voidmix/ui`'s `ThemeProvider`.
- Is not a production runtime or deployment target.

## API application

`apps/api` is the standalone Nitro deployment and the only HTTP composition
root. Its internal `server/api` modules own Hono, oRPC, Auth, and persistence
composition; Web does not host API routes.

- Development runs on port `3002`.
- Production emits Nitro's Node output under `.output/server/`.
- `scripts/start.mjs` starts the service while honoring `PORT` and
  `NITRO_PORT`.
- `server/runtime.ts` memoizes the shared runtime and owns the host lifecycle.
- `server/runtime.plugin.ts` closes runtime resources through Nitro's `close` hook.

Current procedure groups:

```text
health / account.get / auth.capabilities.get
projects.* / library.assets.list / assets.upload.* / activity.list
admin.users.* / admin.audit.list
cloud.conversations.* / cloud.tasks.* / cloud.runs.*
cloud.assets.* / cloud.usage.get / cloud.notifications.*
cloud.preferences.* / cloud.capabilities.get / cloud.tools.get
cloud.admin.runs.* / cloud.admin.usage.get
```

Historical local execution contracts remain isolated while Desktop migration
is deferred; the cloud runtime does not compose the former device runner or
AgentRun database adapter. The new execution protocol is `cloud.*` and uses
its own outbox event type and database baseline.

`GET /health` is available on the standalone API and Web liveness shell. The
runtime requires `DATABASE_URL`; the seeded in-memory repository is reserved
for direct `apps/api/server/api` tests that inject it explicitly.

The oRPC beta transport uses GET for read-only procedures and POST for every
mutation, including asset commits, conflict resolution, Agent transitions, and
lease operations. The client and Fetch handler batch concurrent reads, deduplicate
identical in-flight reads, compress payloads above 1 KiB, propagate an
`x-request-id` response header, retry rate-limited/unavailable reads when the
server supplies `Retry-After`, enforce a 1 MiB request-body limit, and enforce a
15-second request deadline for ordinary RPC. Cloud run/conversation streams
use a separate typed SSE handler without batching, compression or this deadline. Hono preserves a valid incoming `X-Request-Id` and
generates a 21-character Nano ID when one is absent or invalid. GET procedures
are guarded by oRPC's CSRF protection plugin.

The API emits one Evlog wide event per HTTP/oRPC operation. Hono instruments
non-RPC routes, while the oRPC adapter records procedures and errors for
`/rpc/**` without double-logging the request.

Better Auth is mounted at `/api/auth/*` with credentialed CORS. Production
sessions use parent-domain, HTTP-only, Secure, SameSite=None cookies so Web and
Desktop can reuse the API session. Admin uses the
HTTP-only cookie session; Search/Computer and Task pages require authentication. Auth email
verification, password reset, and welcome messages are sent through the typed
`@voidmix/mail` service. Database mail settings override environment fallbacks
and are resolved for every send. Admin responses contain safe effective values,
per-field sources, and inherited previews, while the server-only runtime result
retains the Resend value. Mail-dependent Auth operations return 503 when
configuration is disabled or incomplete without taking down the host.

Registration mode, exact allowed email domains, and verification/reset/welcome
delivery switches are typed database settings. Relevant Auth requests resolve
them immediately before handling, so an Owner update applies without restarting
the process. Public registration and recovery navigation receives only derived
availability booleans, never the domain list, sources, missing fields, or secret
state. Policy rejection uses stable code-only payloads and does not affect
verified-user login. Diagnostic messages are not part of the client contract;
renderer surfaces translate codes locally.
