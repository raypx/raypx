# @voidmix/web

## Purpose

The TanStack Start user-facing application. An app composition root, never
imported by a package.

## Interface

```text
src/
  env.ts             browser-safe Web configuration and logger values
  router.tsx         getRouter(), scroll restoration, preload defaults, Register
  start.ts           SSR serialization of public API error codes
  routeTree.gen.ts   generated — do not edit
  routes/
    __root.tsx       createRootRoute with head() and shellComponent
    manifest[.]webmanifest.ts  server route for the Web App Manifest
    index.tsx        route declaration and home feature composition
    (auth)/route.tsx public authentication group layout
    (auth)/          login, signup, reset, and verification routes
    (app)/route.tsx  authenticated group layout and session gate
    (app)/(admin)/route.tsx  Admin route group within the shared AppShell
    (app)/(admin)/admin.tsx  protected Admin user-directory mount at /admin
    (app)/projects.index.tsx canonical project list route and page
    (app)/projects.$projectId.tsx canonical project detail route and page
  features/auth/     Better Auth forms, shared inputs, links and submission lifecycle
  features/projects/ shared project/task title form
  features/admin/    users adapters, scoped Zustand, views and tests
  features/navigation/ AppShell, account menu, pending/error/retry and pagination
  lib/route-api.ts    request-scoped SSR client and credentialed browser client
  i18n/              catalog loaders, API error codes, recovery copy
scripts/             read-only production bundle analysis
tests/               shared Web test fixtures and cross-feature tests
server/
  health.ts          Web liveness endpoint only
```

## Ownership

- Product images are captures of actual routes using synthetic test data;
  regenerate them with the E2E workspace capture command.
- Own public pages, authentication UI, protected Admin routes, React
  composition, SSR shell, and application-specific visual composition.
- Own no shared primitive — those belong in `@voidmix/ui`.

## Constraints

- `/projects` and `/projects/$projectId` are authenticated canonical project routes backed by `@voidmix/client`; they do not render preview or Workspace compatibility data.

- Project and Admin loaders own remote entities, AbortSignal and mutation
  invalidation. URL search owns filters and cursor; lists explicitly request 50.
- SSR forwards only Better Auth cookies to the configured API. Protected loader
  data carries accountId; account changes hide stale data and clear route caches.
- `start.ts` preserves public API error codes across hydration. Never serialize
  backend error messages, causes, stacks or request context in this adapter.
- Admin DirectoryProvider creates one non-persisted Zustand store per page and
  account. It owns selection, pending IDs and untranslated notice descriptors.
  Filters/pages reset selection; disposal rejects late operation feedback.
- Selection, batch writes and CSV export apply only to the current page. Preview
  adapters may only be explicitly injected by tests; API errors never select them.
- File-based routing. Add `src/routes/<path>.tsx` exporting
  `export const Route = createFileRoute("/path")({ component: X })`. Server-only
  endpoints may use `server.handlers` and omit `component`. The route tree
  regenerates on the next `dev` or `build`.
- Single-route pages live in their route files, including local form state and
  page composition. Keep page components module-private so Start can split them
  automatically. Colocate route-only helpers/tests with the `-` ignore prefix.
  Shared features and Admin composition stay under `src/features/<feature>/`.
  See [ADR-0011](../../docs/architecture/decisions/0011-colocate-single-route-pages.md).
- Keep the project detail component keyed by `projectId` so navigating between
  projects resets drafts and pending form state.
- Keep feature view data, fixtures, types, tests, and styles at the feature root.
  Once a feature has more than about three internal presentation components,
  place those components in a feature-local `components/` directory.
- TanStack route groups use parenthesized directories such as `(auth)` and
  `(app)`. A group's `route.tsx` is its layout and the group name does not appear
  in the URL.
- **`routeTree.gen.ts` is generated; never hand-edit it.** `.prettierignore`
  keeps the formatter away from it for the same reason.
- The root route uses **`shellComponent`**, not `component`. `RootDocument`
  renders the whole `<html>` document including `<HeadContent />` and
  `<Scripts />`; do not move either into a separate wrapper.
- The root loader owns locale **and** theme resolution
  (`src/lib/request-preferences.ts`) — both providers need the value before the
  first render or they paint a wrong one and correct it in an effect. Root
  composition supplies the server-resolved current catalog to
  `AsyncI18nProvider` from `@voidmix/i18n`; `i18n/messages.ts` owns the
  locale-specific dynamic import map and feature modules select namespaces with
  the facade hook.
- `noUnusedLocals` and `noUnusedParameters` are enabled here, so an unused
  import fails `check`.
- Better Auth and `@voidmix/client` use the configured independent API origin
  with credentials. Desktop remains an absolute-origin API consumer.
- Web owns only the liveness `/health` route; never add a catch-all API handler
  that can swallow TanStack routes.
- Web does not initialize a database or API runtime.
- The Docker build requires the public `VITE_API_URL` build argument. Keep its
  declaration and missing-value guard: runtime-only variables cannot repair an
  already-built browser bundle, and Web does not serve same-origin RPC/Auth.
  Optional site, support, Sentry and PostHog values also use declared public build arguments.
- `server/env.ts` is never imported by browser modules. Keep database, Auth, mail,
  and allowed-origin values on the server side of the Web bundle.
- `(app)/route.tsx` uses account.get as a navigation aid and
  retains the client-side session gate for hydration and stale-cookie recovery.
  It is navigation aid, not authorization enforcement; the API remains the
  final authorization boundary.
- `(app)/route.tsx` owns AppShell, shared by projects and Admin. The Admin group
  exposes the user directory; its navigation entry is visible only to owners
  and admins. API authorization remains authoritative.
- All protected routes use the same Neutral AppShell. Public imagery comes from
  the guarded capture command and matches locale, theme and viewport. Its
  generated size manifest reserves space before image loading.
- Public Auth pages consume only `auth.capabilities.get`. Registration and
  tokenless reset entry points follow those booleans, an existing reset token
  remains usable, and capability-request failures fail open so the server remains
  the final policy boundary.
- Stylesheets: `src/styles.css` imports `@voidmix/ui/styles.css`, then the root
  route imports that single entry with `?url` and feeds it through `head().links`.
- Keep page layouts and responsive states in component Tailwind classes. CSS
  entries retain shared tokens, global document rules and browser autofill fixes.
- Dev server is `strictPort` on 3000. Vite plugin order is
  evlog → nitro → tailwindcss → tanstackStart → viteReact. RSC stays disabled
  until a measured Server Component migration beats the equivalent client build.
  The React plugin uses the Oxc-backed React Compiler. Nitro uses explicit
  Web-format routes with directory scanning and its automatic server entry off.
- Keep menu-heavy secondary interactions out of the home route's initial client
  path. Language, theme, and Composer attachment menus preload on focus or
  pointer interaction and load their Base UI menu implementation on demand.
- The home navigation uses `LanguageSwitcher` on desktop and mobile. Its trigger
  stays disabled until hydration so an early click cannot be lost; language
  persistence remains owned by the root i18n provider.
  Language names use fixed native labels (`English`, `简体中文`); only the
  surrounding control copy is translated.
- Web feature code uses `@voidmix/ui/toast` for Toast notifications. The bridge
  loads `@voidmix/ui/components/ui/toast` on the first `toast.add()` call and
  the root's `AsyncToaster` mounts its UI only after that module is ready. Do not
  import the concrete UI Toast subpath directly from Web routes or features.
- Import extensions are inconsistent per file (`../env.js` vs `./routeTree.gen`).
  Mirror the neighbouring import rather than reasoning about it.
- Keep `vite.config.ts` and `vitest.config.ts` separate. Loading the application
  plugin pipeline in the test runner breaks React 19's CJS entry — see
  [testing](../../docs/development/testing.md).
- Web SSR loads only the resolved locale catalog before the first render. The
  `AsyncI18nProvider` keeps the current catalog visible while a language switch
  loads, commits locale and messages together, and permits retries after a load
  failure. Root recovery pages use static `i18n/recovery-messages.ts` copy
  to survive a broken application chunk, drift-guarded by its test.

## Verification

```bash
bun run build:web   # shipping gate; regenerates routeTree.gen.ts via Start
bun run --cwd apps/web check
bun run --cwd apps/web test
bun run test:e2e                         # Playwright smoke, needs browsers
```

## Cloud product

- `/chat`, `/chat/$conversationId`, `/tasks`, `/tasks/$taskId`, `/settings/usage`
  and `/notifications` compose canonical `cloud` client contracts. Project detail
  lists use scoped cursor navigation; conversations can load older turns while
  preserving their live session. Project detail creates cloud Tasks; no Web route requires a local device or imports a runner.
- Successful sign-in defaults to `/chat`; explicit protected destinations retain
  their existing authorization and return behavior.
- Cloud features own account/resource-scoped session lifetimes, draft and action
  state. Account changes unmount them; pending requests and blob URLs are disposed.
- Each Router/SSR request owns a QueryClient. Ordinary Task/Round/Revision,
  lists, file metadata, usage, notification, preference and capability reads use
  `lib/cloud-queries.ts` through Client; keys include actor/account and resource
  scope. Router loaders prefetch them; feature consumers subscribe with Query.
- Conversation and Run live projections belong only to Client Sessions. Route
  bootstrap seeds the Conversation Session; do not put live snapshots in Query
  or a second store. `features/runs` owns its controller and controlled panels.
  Actions refresh durable facts without replacing SSE. Terminal invalidation is
  targeted and occurs once for a locally created or actively followed Run.
- Computer prompts explicitly select new Task, new goal Round, or continuation
  of the current unaccepted Round. Retry keeps the Run's existing Round; steer
  targets that Run. Revision acceptance includes its Round and goal version.
- Older Conversation/Run pages load on request. Durable message projections
  render without replaying every historical delta; shared pure selectors retain
  unchanged row references. Usage polls every 15 seconds while visible.
- Files use immutable version IDs and a bounded account-owned memory cache;
  signed URLs are requested at use time, checked for expiry and never persisted
  or dehydrated. Account exit aborts reads, revokes blob URLs and clears caches.
- Project managers can explicitly authorize/revoke AI spending on project
  detail. Editing rights alone grant no spending permission; API remains final.
- Notifications own email opt-in and recipient locale; usage displays unknown
  consumption explicitly and labels model costs as estimates.
- Optional PostHog/Sentry browser adapters load after hydration and receive only
  allowlisted metadata. Disable autocapture/replay; no user content, credentials,
  resource paths or signed URLs enter their events.
- Public `/docs`, `/privacy`, `/contact`, `/robots.txt` and `/sitemap.xml` use
  localized metadata and deployment `VITE_SITE_URL`; Contact uses optional
  `VITE_SUPPORT_EMAIL` and explicitly reports missing support configuration.
  Markdown/diff vendors are excluded from SSR via the shared wrapper’s build guard.
  Protected pages are noindex and absent from sitemap.
