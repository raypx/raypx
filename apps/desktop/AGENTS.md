# desktop

## Purpose

The Electrobun 2 cloud project client: a TanStack Start SPA renderer in a native
window with a pinned Bun host. An app composition root, never imported by a package.

## Interface

```text
src/
  router.tsx        getRouter() over the generated file-route tree
  routeTree.gen.ts  generated — do not edit
  routes/
    __root.tsx      static document shell, locale bootstrap, DesktopShell layout
    index.tsx       redirects / to /projects
    projects/
      route.tsx     project layout with Outlet
      index.tsx     projects list index route and page
      $projectId.tsx project detail, tasks, and not-found view
    settings/route.tsx theme preferences
  styles.css        shared UI and Desktop stylesheet entry
  env.ts            desktop environment composition
  features/shell/   Electrobun-aware shell, account lifecycle, loading and retry UI
  lib/account.ts    authenticated cloud account loader
  lib/projects.ts   canonical project and task API access
  lib/desktop.ts    typed Electrobun window/runtime bridge
  lib/preferences.ts persisted theme store
  App.css           global renderer rules and native window drag regions
  router.integration.test.tsx route, account, refresh and history tests
  i18n/             static catalogs and locale bootstrap
native/
  main.ts           Bun entry, persistent WebView, tray and window composition
  rpc.ts            typed renderer/host window contract
  window.ts         close-hide, restore and minimum-size policy
  smoke.ts          explicit real native/renderer acceptance entry
  icons/            preserved application and tray icons
electrobun.config.ts app identity, native inputs, icons and SPA asset copy
hutch.config.ts      exact devkit pin and external Bun package manager
```

## Ownership

- Own the desktop shell, Electrobun window bridge, and desktop-specific routing.
- Own no shared primitive, backend behaviour, or Agent execution; cloud project
  access goes through `@voidmix/client`.

## Constraints

- Use TanStack Start file routing in **SPA mode** with RSC disabled. Single-route
  pages live in route files as module-private components and split automatically.
  Use `Route` hooks for typed loader data and search parameters. Shared features
  remain under `src/features/`. See
  [ADR-0011](../../docs/architecture/decisions/0011-colocate-single-route-pages.md).
- Organize URL segments as directories: `route.tsx` for segment/layout,
  `index.tsx` for its exact page, and `$param.tsx` for dynamic children.
  `projects/route.tsx` renders an `Outlet` for list and detail routes.
- `/` redirects to `/projects`. Primary navigation exposes Projects and Settings.
  Packaged `views:` URLs use hash history; HTTP browser previews keep normal URLs.
  Settings configures only the theme; language remains in the titlebar.
- Project loaders are client-only and pass the route abort signal to API reads.
  Lists request 50 rows and keep the cursor in URL search, preserving history.
  Details include tasks and access capabilities. Missing projects use a dedicated
  not-found view; absent API data produces unavailable states, never demo data.
- Pages read typed loader data. Successful project/task mutations invalidate the
  owning route. Pending and retry UI lives in `features/shell/route-state.tsx`.
- Account changes hide stale project data and invalidate protected route data.
  The API performs final authentication and authorization.
- `lib/preferences.ts` owns only theme in a Zustand store. Use selectors and
  restore preferences after mounting. Validate persisted fields, preserve the
  previous theme key, and tolerate unavailable storage with usable memory state.
  Retired fields from old stored preferences are ignored and not persisted again.
- `routes/__root.tsx` owns the static HTML document, stylesheet link, locale
  bootstrap and document. Prerender emits a deterministic English loading state;
  `ClientOnly` mounts navigation after hydration so native hash URLs match links.
  Hydration reads localStorage and `navigator.language`; storage or document-sync
  failures must not make the renderer unusable.
- **`routeTree.gen.ts` is generated; never hand-edit it.** Start's Vite plugin
  refreshes it during `dev` or `build` and owns the Register footer. After route
  removal, regenerate with the Start dev plugin before root `build:desktop`,
  whose graph checks the existing route types.
- Desktop has no runtime server or local Agent runner. Do not add Start server
  functions/routes, provider credentials, Node resources, or local file access.
  Backend behaviour remains behind `@voidmix/client` and `VITE_API_URL`.
- Start writes `dist/client/index.html`. Electrobun copies the entire client
  directory to `views/main`; build-time `dist/server` is never packaged.
- Bun and Turbo own dependencies and the task graph. Hutch is only Electrobun's
  pinned native packager/devkit provider; `hutch.config.ts` declares no task runner
  scripts and delegates any package-manager operation to the repository Bun.
- `native:prepare` materializes the exact generated `.hutch/devkit` before Vite
  or typechecks. Vite resolves the SDK with official `electrobunViteAliases`.
  Native strict checking consumes generated `.hutch/types` declarations so
  upstream SDK implementation errors do not weaken our compiler options. Never
  edit or commit either generated directory.
- `check` runs renderer, bundled configuration, and native typecheck passes.
  Preserve the independent `vitest.config.ts` and standard test-layer scripts.
- macOS uses native WebKit. Windows bundles CEF and explicitly preserves web
  security; the host rejects Windows builds without the configured CEF runtime.
- Native RPC exposes only runtime metadata and window hiding. Business requests,
  cookie authentication and permissions stay on `@voidmix/client` and the API.
- Native uses a `persist:voidmix` WebView partition for cookies and preferences.
  Electrobun 2.0.2 does not forward partition from BrowserWindow; replace its empty
  initial view before loading the SPA. Keep auto-resize and the active view ID.
- Only trusted bundled/loopback-development content receives the native bridge.
  Do not grant local files, shell, provider credentials or general business RPC.
- Use `will-close` with `response.allow = false` before hiding. Tray Show restores
  minimized windows and activates them; Quit uses the native graceful exit API.
  Tray Quit unloads into the bundled empty close view before approved native
  shutdown, with a bounded fallback if the view has already closed or failed.
  If the tray is unavailable, native close exits the host.
  Resize events enforce the 800×620 minimum because SDK 2.0.2 has no min-size option.
- `desktop:build` runs root `build:desktop` through Turbo before `native:build`.
  Native development uses localhost:1420 when Vite is available, otherwise the
  last built SPA. Package for each native OS/architecture on its own runner.
- Renderer and native window support a minimum width of 800px. Navigation
  collapse is local shell state. Closing hides the main window; tray actions
  show, hide or quit. The host reports `trayEnabled`, false in browser previews.
- This is the only workspace with a user-visible version. Record user-facing
  changes in [`CHANGELOG.md`](./CHANGELOG.md); keep `package.json`,
  `electrobun.config.ts` versions in step. Keep the framework pin in root catalogs
  and `hutch.config.ts` synchronized.
- Use shared shadcn Neutral tokens, `@voidmix/ui` primitives and Phosphor icons;
  do not introduce Radix or Lucide. Keep page layouts in Tailwind classes and
  CSS entries limited to tokens, global renderer rules and native behaviour.

## Verification

```bash
bun run --cwd apps/desktop test
bun run --cwd apps/desktop check
bun run build:desktop
bun run i18n:check
bun run desktop:build

# SDK/editor preparation and native dev, after the frontend has been built:
bun run --cwd apps/desktop native:prepare
bun run --cwd apps/desktop native:dev
```

Native acceptance uses `VOIDMIX_NATIVE_SMOKE=1` with `native:dev`, a loopback
isolated test API, synthetic account credentials and expected project title.
Run `VOIDMIX_NATIVE_SMOKE_PHASE=write`, then `read` in a second process to verify
native lifecycle, SPA assets, real authenticated reads and restart persistence.
Use `VOIDMIX_NATIVE_SMOKE_PHASE=shell` for bundled `views:` asset, bridge and
native lifecycle acceptance without an API or authentication claim.
The smoke entry uses its own application identity and persistent test partition,
never ordinary builds. `VOIDMIX_NATIVE_SMOKE_VIEW_URL` may select a loopback HTTP
preview for same-site test cookies. Report that separately from packaged `views:`
acceptance; production `SameSite=None; Secure` cookies require an HTTPS deployment.
See [testing](../../docs/development/testing.md) for the test database gate.
