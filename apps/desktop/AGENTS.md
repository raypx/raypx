# desktop

## Purpose

Development diagnostics use the private `@raypx/devtools` bridge under existing
renderer providers, guarded by `import.meta.env.DEV`. The official Dock runs only
with Vite serve; no Go or IPC clipboard interface is added. Copy failures reveal
selected JSON for manual copying. Native and compiled builds must not contain
the diagnostics bootstrap or panel. See the page DevTools development guide.

MyGo composition root with the existing React/Vite renderer, persistent system
WebView, tray and standalone Bun CLI. internal/AGENTS.md owns Go host rules;
README.md lists the layout, build and acceptance commands. Preserve DesktopBridge.

## Interface

`main.go`, `go.mod` and `mygo.config.ts` share the frontend root, following the
MyGo Web template. `main.go` embeds prepared assets and calls `internal/app`,
which owns MyGo windows, tray and restricted renderer entry points.
`internal/desktop` owns framework-independent native transport/policy. `bridge.ts` declares the
renderer contract.
The renderer is a TanStack Start SPA: routes live in `src/routes`, `src/router.tsx`
provides TanStack Query, `src/components/shell.tsx` fills the shared shell, and the
build writes `dist/client` for the native app origin. Every shell route declares
`staticData.page` (title key from `PageTitle` in `src/router.tsx` and a Blocks page
layout); the shell derives breadcrumbs and the page template, so pages never add
their own outer width or gutters.

`@raypx/contracts/local-client` owns renderer method/parameter/reply inference and validates both sides of IPC; callers never supply reply generics.
`preferences.ts` shares preference types/validation; `src/preferences.tsx` owns renderer initialization. Complex page logic lives under `src/features/`; simple pages stay in route modules. `features/tasks/project-navigation.tsx` loads device-owned authorized projects for
sidebar shortcuts, keeps a bounded device-local recent selection and opens `/tasks?scope=local&project=...`. This filters the loaded task page, never creates
work or reads remote/account-owned projects. Account and settings share the footer.

`src/routes/(local)/route.tsx` is the pathless native-tools boundary (route group, like Web's `(app)`); sign-in pages live in the `(auth)` group. It disables
SSR for native route lifecycles, provides the desktop capability in `beforeLoad` and shares root grants between Files and Jobs. Refresh grants when entering this
branch (`shouldReload` with cause enter), and reuse them between its child pages. Explicit invalidation still refreshes the cache. Engine-ready events invalidate
the local branch; job-finished events refresh only the active Jobs route. These tools are available without login; the CLI engine remains independent of account sessions.

`/automations` defaults to device schedules; `scope=cloud` mounts the account-gated
`@raypx/jobs/client` view. Preserve local form/history state across tabs and account
changes. Local reads use the route loader; mutations invalidate it. Keep root errors
silent and successful lists during reload failure. Cloud state is account/client-keyed,
aborts on identity change and never loads before login. Validated
`/tasks?scope=remote&taskId=...` links read projections without executing tasks.
Files keeps rootId/path/offset in validated route search. Directory navigation
pushes history; pagination replaces it. The loader defers its listing promise to
the table so the editor and toolbar stay mounted during reloads. Features/files
owns components, mutation actions and a scoped Zustand vanilla store for drafts,
operations and feedback. URL/server data stay outside that store. Confirm dirty
directory/route exits once, preserve drafts during pagination, and discard state
after leaving. Ignore late mutation responses on directory changes or unmount;
the underlying IPC is not cancelled. Native loaders never run during preloading or SSR.

## Ownership

Own native directory authorization and local UX. Runtime implementations live exclusively in CLI and shared schemas in `@raypx/contracts/local`; never import CLI source. Account loading and views use `@raypx/account` and `/client`. Client instances live in `src/features/auth/client.ts`. Logout actions use `@raypx/auth/hooks`; the renderer owns navigation and session display.

`src/features/auth/components/form.tsx` adapts the shared `@raypx/auth/client` form
for Desktop account URLs, auth client and router search. Shared forms own fields,
translated feedback and submission state; the renderer owns navigation. Renderer tests use
`tests/renderer/unit/` and `tests/renderer/component/`, mirroring feature and route directories.
Task renderer tests separate conversation, history and drafts with per-case fixtures; shared relay tests live in Host. MyGo transport/policy tests live in `tests/native/host/`.
These tests exercise real subprocesses and OS locks with Go. TS native smoke drivers use Bun types. `tests/native/smoke/` contains the
packaged assertions driven over the native-smoke private socket.
Native scripts/tests live in `scripts/native/` and `tests/scripts/native/` with Bun types.
All tests stay outside `src/routes/` discovery and the renderer configuration.
Use short feature-local filenames such as `form.tsx` and `routes.test.tsx`; exported symbols retain feature context. Test scripts select `component/` and
`integration/` directories; `test:unit` explicitly selects renderer unit, native fixtures and
script cases. File extensions
describe source syntax, and each suite declares its required test environment.

The account route reads its remote projection in a client-only loader; auth
mutations invalidate route data on success. Keep Better Auth session updates as
invalidation signals rather than a second account-query state machine.
Local tools render during session/network checks. Auth routes use a standalone layout; `RemoteBoundary` gates private views and returns to an allowlisted destination. Logout returns to local tools. Keep the coordinator mounted.

## Constraints

- MyGo v0.7.3 uses WKWebView/WebView2. Build with Go 1.27.3 and CGO_ENABLED=0.
  Framework APIs live in internal/app; native transport/policy in internal/desktop.
  Opaque business JSON uses TS contracts as the sole business schema authority.
- Build a prerendered SPA in dist/client and embed it under generated/frontend.
  Packaged routes use hash history; no frontend server runs in packaged apps.
  The root remains text-free; translated providers initialize inside ClientOnly.
- Launch only the absolute, version-matched bundled CLI at resources/bin/raypx.
  Package the complete verified Herdr distribution in resources/bin/herdr. CLI
  copies terminal resources into its profile before use, avoiding Windows DLL locks.
- macOS and Windows connect to the independent daemon; GUI Quit preserves Agent
  work. Spawn CLI children through Command so Windows opens no console. Terminal
  hooks remain daemon-only. Hide/minimize/quit releases UI approval leases.
- Renderer IPC cannot call host.*, approvals.local.watch, observed.remote or
  roots.register. Only native directory pickers grant roots. Connector recovery
  uses the bundled CLI and native-owned config directories. Validate external URLs.
- Cookie/Set-Cookie and restricted host credentials never enter renderer responses.
  Keep allowlisted paths/headers, deadlines, cancellation, AES-GCM session-v2 and
  OS key storage native. Sanitize errors. Persistence failure disables session
  transport; temporary key-service failures preserve existing encrypted files.
- Load bounded runtime TOML from absolute RAYPX_HOME or ~/.raypx; invalid config
  stops startup. Only configured API origins are reachable. Isolate sessions,
  browser storage, remote settings and account-owned history by server origin.
- SessionKeys uses MyGo Secrets on every platform with the current service/key
  identity and raw bytes. Never read, rewrite or import retired keyring formats.
- Keep native data paths and the lifetime desktop-instance.sqlite exclusive lock
  stable; never unlink an owned lock. Preferences remain
  device-local. Native reports raw JSON and read/missing/unreadable; renderer
  validates. Missing preferences use defaults and never import browser values. Serialize complete
  updates and atomically preserve other top-level fields. A failed preference save keeps
  current UI choices and shows translated feedback with a deliberate retry; only native
  acknowledgements mark snapshots saved. Ignore obsolete completion feedback.
- Only the owned main page at its bundled origin or localhost dev view receives
  IPC. Deny external navigation/popups. Event delivery is bounded and acknowledged.
- CSP hashes startup scripts and rejects arbitrary inline JS/eval. Production
  renderer builds eliminate the native-smoke observation hook.
- Bun/VP owns JS tasks and caches; Go owns native compilation caches. Default build
  checks/builds the renderer. Explicit packaging stages renderer, CLI and Herdr and
  invokes MyGo uncached. Go host verification is explicit in the shared task graph.
- Native smoke exists only in the native_smoke Go build tag, with random-token
  private IPC, isolated profiles and a separate renderer/package output. Production
  has no socket/eval controls. Inspect actual build metadata and bytes before release.
- Local tests stay quiet and never activate windows/switch desktops. Foreground
  acceptance runs on isolated CI unless the user explicitly requests a local run.
- Signed updates use MyGo keys/manifests. Do not reuse the previous update feed.
  Report unsigned/ad-hoc packages, unrun GUI/platform and live-provider gates
  accurately. Linux native acceptance remains unverified.

## Verification

Daily changes run affected Desktop check/test through repository `bun run verify`.
Native host, IPC, native resources/scripts and terminal/daemon changes also run
mygo:check/mygo:test and CI on the affected native platforms. Renderer-only changes
need no native runner. Release preparation adds build:desktop, mygo:smoke (headless),
package:desktop and repository verify --full. Go policy tests need no GUI.
For races: go test -race ./internal/... ./tests/native/host/....

native:smoke builds the separate MyGo host/renderer and checks CLI handshake,
local tools/terminal, native event credit, server isolation, restart/persistence
and tray. Quiet mode uses inactive windows and suppresses notifications/dialogs;
interactive mode adds focus/close/resize acceptance on isolated CI. Windows hosted
CI installs/uninstalls the actual per-user NSIS package and verifies payload hashes.

native:agents and native:beta are opt-in real-provider/account gates. They require
RAYPX_LIVE_AGENTS=1 and isolated data and consume provider inference. HTTPS session
persistence must use a real or synthetic HTTPS API; loopback HTTP is not proof of
production cookie persistence. Never count an unrun native platform as passed.
