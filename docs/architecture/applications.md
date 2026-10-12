# Applications

This document describes what each application is for, how it is built, and how
it is deployed. Each application's own `AGENTS.md` owns its interface,
constraints, and verification commands; keep those details there rather than
duplicating them here.

## Web

`apps/web` is the public/product-facing TanStack Start application and the
browser composition root for authentication, Projects and the cloud product.

- Uses `@raypx/ui` and controlled `@raypx/agent-ui` views; owns Web routes,
  metadata, SSR and content. Search/Computer live at `/chat` and Task deliveries
  at `/tasks`; file review, notifications and account usage use the cloud API.
- Serves `/manifest.webmanifest` through a TanStack Start server route with the
  Raypx name, launch scope, theme, and shared 512×512 brand mark for
  install-capable browsers.
- Route files declare URLs and own single-route pages, including the canonical
  project list/detail. Shared Auth features remain separate; the home
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
  loaders. Project list/detail own remote data in loaders,
  with request cancellation and mutation invalidation. SSR creates a client
  per request; account changes hide stale data and clear protected caches.
- Public Auth pages consume a separate three-boolean capability view and fail
  open when it cannot be loaded; authentication and mail settings retain their
  server-side inheritance. Retired settings administration routes stay absent.
- Admin pages, navigation and management RPCs are retired under
  [ADR-0021](./decisions/0021-retire-admin.md).
- Runs on port `3000` in development.
- Produces a TanStack Start server bundle and a browser bundle.
- Resolves locale from the `locale` Cookie, `Accept-Language`, then English; the
  document and React provider share the loader result for hydration safety.
- Loads only the resolved Web locale catalog before SSR through the root loader
  and mounts it with `AsyncI18nProvider` from `@raypx/i18n`. The Web-owned
  loader map dynamically imports the other locale on language switch; feature
  components select namespaces through the facade. Recovery pages retain their
  independent static copy.
- Calls the standalone API origin through the shared typed client with
  credentialed cookie requests; it does not mount API handlers.
- Conversation/run sessions are scoped by account and resource. The app owns
  drafts and pending mutations, releases subscriptions on navigation and rejects
  late responses. Private routes are noindex and excluded from the public sitemap.
- The API owns `DATABASE_URL`, Auth, mail, Redis, and persistence composition.

## Desktop

`apps/desktop` is an Electrobun 2 application with a TanStack Start SPA renderer.

- Shares `@raypx/ui` and `@raypx/client`; contracts reach the renderer through Client.
- Uses Start file routing and SPA mode with RSC disabled. The Start server build
  is used only to prerender `dist/client/index.html`; Electrobun packages that
  client directory alongside a narrow TypeScript native host on Bun 1.4.0.
- Resolves locale from localStorage, `navigator.language`, then English after
  hydrating the deterministic English build-time shell, and switches
  synchronously against the statically mounted catalog.
- Uses Start's automatic route component splitting so page code loads separately
  from the shell and shared static catalog.
- Desktop navigation exposes Projects and Settings; `/` redirects to `/projects`.
  Project and task list/create/detail flows use client-only route loaders, with
  shared pending and retry states. The former Home overview, Activity and Devices
  pages are retired under [ADR-0019](./decisions/0019-retire-legacy-desktop-execution.md).
- Project creation and refresh invalidate the owning route. Route cancellation
  reaches the API transport, and late responses cannot replace newer navigation.
- Zustand owns the renderer theme preference. Remote data remains in route loaders
  and transient form fields remain local. The shell restores theme after hydration;
  persistence validates the saved theme, migrates the previous theme key and
  tolerates unavailable localStorage. Retired settings fields are ignored.
- Owns no Start server functions or server routes. Runtime data continues to
  come from the cloud API through `@raypx/client`.
- `native/` owns tray/window lifecycle and the typed runtime/window RPC. A
  persistent WebView partition retains preferences and cookies; packaged SPA
  navigation uses hash history so reloads resolve to the static entry.
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
  the API is absent; production pages never substitute preview fixtures.
- Routes use directories for URL segments: `route.tsx` defines the segment,
  `index.tsx` its index page, and `$projectId.tsx` the dynamic child. The
  `projects/route.tsx` layout renders an `Outlet` for the list and detail views.
  Missing projects have a route-specific
  not-found page with a link back to the list.

The native seam lives in `apps/desktop/native/`. `desktop:build` enters the root
`build:desktop` gate before `native:build`; `native:prepare` obtains the pinned
Electrobun SDK before Vite and typechecking. Search/Computer and delivery review
remain Web capabilities. See [ADR-0020](./decisions/0020-electrobun-desktop-host.md)
for the main-process and packaging boundary.

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

`apps/storybook` is the development workbench for `@raypx/ui` primitives.

- Runs on port `6006` in development.
- Owns component stories and visual documentation, not product routes or API
  calls.
- Loads the shared Tailwind v4 tokens and `packages/ui/src/styles.css` so
  stories exercise the same design system as the applications.
- Provides a Light/Dark toolbar backed by `@raypx/ui`'s `ThemeProvider`.
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
cloud.conversations.* / cloud.tasks.* / cloud.runs.*
cloud.assets.* / cloud.usage.get / cloud.notifications.*
cloud.preferences.* / cloud.capabilities.get / cloud.tools.get
```

The former `projects.agentRuns`, `devices` and `runner` contracts and their
adapters are retired. Missing paths receive the ordinary 404 response. The
execution protocol is `cloud.*` with the private Gateway, its own outbox event
type and database baseline; [ADR-0019](./decisions/0019-retire-legacy-desktop-execution.md)
records the retirement and data boundaries.

`GET /health` is available on the standalone API and Web liveness shell. The
runtime requires `DATABASE_URL`; the seeded in-memory repository is reserved
for direct `apps/api/server/api` tests that inject it explicitly.

The oRPC beta transport uses GET for read-only procedures and POST for every
mutation, including asset commits, review decisions, Cloud transitions, and
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
Desktop can reuse the API session. Search/Computer, Projects and Task pages
require authentication. Auth email
verification, password reset, and welcome messages are sent through the typed
`@raypx/mail` service. Database mail settings override environment fallbacks
and are resolved for every send. Configuration readers retain field sources
and safe inherited previews; the server-only runtime result retains the Resend
value. There is no configuration write RPC. Mail-dependent Auth operations return 503 when
configuration is disabled or incomplete without taking down the host.

Registration mode, exact allowed email domains, and verification/reset/welcome
delivery switches are typed database settings. Relevant Auth requests resolve
them immediately before handling, so a database configuration update applies without restarting
the process. Public registration and recovery navigation receives only derived
availability booleans, never the domain list, sources, missing fields, or secret
state. Policy rejection uses stable code-only payloads and does not affect
verified-user login. Diagnostic messages are not part of the client contract;
renderer surfaces translate codes locally.
