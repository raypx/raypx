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
Packaged MyGo routes use hash history. Settings is a lazy global dialog selected
by the route's `settings` fragment, as in `#/files#settings`,
preserving the background path/search, mounted editors and scroll. Closing uses
the matching background history entry or removes only the fragment for a direct link.

`@raypx/contracts/local-client` owns renderer method/parameter/reply inference and validates both sides of IPC; callers never supply reply generics.
`src/lib/platform.ts` creates isolated DesktopPlatform ports; application composition
in desktop.ts selects MyGo. Components use platform-context for injection. RuntimeProvider
owns engine state and project-catalog invalidation; its controller fences stale reads
against events and disposal. Project views reuse project-catalog and pure project selection.
First connection gates project/provider queries; subsequent outages keep the workspace mounted.
EngineRouteSync lives outside that gate and refreshes local route loaders on readiness,
including an initial failure before the local layout mounts.
`preferences.ts` shares preference types/validation; `src/preferences.tsx` owns renderer initialization. Complex page logic lives under `src/features/`; simple pages stay in route modules. `features/tasks/project-navigation.tsx` loads device-owned authorized projects for
sidebar shortcuts, keeps a bounded device-local recent selection and opens
`/tasks?scope=local&project=...&device=...`. Sidebar session groups reuse the shared
Tasks view. Project and computer filters apply before storage pagination. The shell
opens the composer with `compose=true`, which the route clears after focusing the
editor. New session and search are icon buttons beside the sidebar toggle in the
native title bar. Account and settings share the footer.

`src/routes/(local)/route.tsx` is the pathless native-tools boundary (route group, like Web's `(app)`); sign-in pages live in the `(auth)` group. It disables
SSR for native route lifecycles, provides the desktop capability in `beforeLoad` and shares root grants between Files and Jobs. Refresh grants when entering this
branch (`shouldReload` with cause enter), and reuse them between its child pages. Explicit invalidation still refreshes the cache. Engine-ready events invalidate
the local branch; job-finished events refresh only the active Jobs route. These tools require initial instance enrollment and then work offline; the CLI engine remains independent of online account sessions.

`/automations` defaults to device schedules; `scope=cloud` mounts the account-gated
`@raypx/jobs/client` view. Preserve local form/history state across tabs and account
changes. Local schedule presets and previews use `@raypx/core/jobs` calendar rules; invalid
Cron/time zones stay in the form and never submit. Local automation history follows the latest
selection, ignores responses after close/removal/unmount, and refreshes on matching job
start, completion or engine readiness. Pi automations require a project and history links to
the device-owned session for approvals, cancellation and results. The trigger details panel uses
private IPC for Webhook and GitHub keys and email addresses. File watches use project-relative paths.
Local reads use the route loader; mutations invalidate it. Keep root errors
silent and successful lists during reload failure. Cloud state is account/client-keyed,
aborts on identity change and never loads before login. Validated
`/tasks?scope=remote&taskId=...` links read projections without executing tasks.
`/` restores a valid recent local project or shows authorization/Agent onboarding.
`/files` keeps rootId/path/offset in validated route search. Project tools consume
the application target; an unavailable explicit project never falls back to another
directory. Session selection lives in the URL. Draft/editor slots include the
owner, computer and project. Directory navigation
pushes history; pagination replaces it. The loader defers its listing promise to
the table so the editor and toolbar stay mounted during reloads. Features/files
owns components, mutation actions and a scoped Zustand vanilla store for drafts,
operations and feedback. Files uses a responsive list/editor split, ancestor breadcrumbs,
editor-scoped save shortcuts and focus restoration. URL/server data stay outside that store. Confirm dirty
directory/route exits once, preserve drafts during pagination, and discard state
after leaving. Ignore late mutation responses on directory changes or unmount;
the underlying IPC is not cancelled. Native loaders never run during preloading or SSR.

`/terminal` opens the execution host's default shell only after an explicit action,
using the selected project's directory. Custom executable, arguments and directory
stay in advanced options; an unavailable project never falls back to another directory.
The daemon resolves and validates the shell, not the renderer's platform hints.
Keep terminal IDs and disable input during outages; restore on ready and offer
existing scoped terminals after reload. Leaving the page does not cancel accepted
execution. Only explicit stop/GUI Quit ends it; never resend commands or input.

## Ownership

Own native directory authorization and local UX. Runtime implementations live exclusively in CLI and shared schemas in `@raypx/contracts/local`; never import CLI source. Account loading and views use `@raypx/account` and `/client`. Client instances live in `src/features/auth/client.ts`. Logout actions use `@raypx/auth/hooks`; the renderer owns navigation and session display.

The `/login` route and Host reauthorization open the configured API OAuth
authorization endpoint in the system browser. Host renewal requires fresh
authentication for the account already bound to the profile. The daemon owns the temporary callback and token exchange. Refresh
the renderer session and resume the validated Desktop route after completion.
`src/features/auth/components/form.tsx` adapts the shared `@raypx/auth/client` form
for Desktop account URLs, auth client and router search. Shared forms own fields,
translated feedback and submission state; the renderer owns navigation. Renderer tests use
source-adjacent `*.test.ts` and `*.component.test.ts(x)` suites. Desktop-only compiled
browser acceptance lives in `e2e/`, uses `@raypx/e2e/testing` fixtures and runs
through `bun run --cwd apps/desktop e2e` (root: `test e2e --package desktop`). Shared
journeys register through `@raypx/e2e/journeys/*`; the `desktop` Playwright project
selects only this renderer and its compiled assets. It does not establish native WebView acceptance.
Task renderer tests separate conversation, history and drafts with per-case fixtures; shared relay behavior is tested at its CLI, Control and Client owners. MyGo transport/acceptance tests live in `tests/native/host/`; native admission and capability-port tests live in `internal/desktop/`.
These tests exercise real subprocesses and OS locks with Go. TS native smoke drivers use Bun types. `tests/native/smoke/` contains the
packaged assertions driven over the native-smoke private socket.
Native scripts and their pure policy tests live in `scripts/host/` with Bun types;
build/filesystem/process integration cases live in `tests/integration/native/`.
All tests stay outside `src/routes/` discovery and the renderer configuration.
Use short feature-local filenames such as `form.tsx` and `form.component.test.tsx`; exported symbols retain feature context. Route composition suites live beside the router.
Native Vitest projects select unit, component and integration suites. `test:unit` and
`test:component` require no CLI, Go, WebView, system secrets or Provider installation;
native build/process cases run in `test:integration`. Default `test` aggregates all three.
tests/helpers/desktop provides typed per-case ports; unknown requests fail and events
never leak between fixtures. Keep real process/IPC acceptance in the Go/native gates.
File extensions
describe source syntax, and each suite declares its required test environment.

The account route reads its remote projection in a client-only loader; auth
mutations invalidate route data on success. Keep Better Auth session updates as
invalidation signals rather than a second account-query state machine.
Local tools render during session/network checks. Auth routes use a standalone layout; `RemoteBoundary` gates private views and returns to an allowlisted destination. Logout returns to local tools. Keep the coordinator mounted.
The root `DesktopSignOutProvider` owns explicit logout for the shell, account page
and instance gate. Clear account caches after web sign-out; retain failed native
cleanup across routes/gates and retry it manually or on engine/network recovery,
without repeating web sign-out or dropping the device identity.

## Constraints

- MyGo v0.8.3 uses WKWebView/WebView2. Build with Go 1.27.3 and CGO_ENABLED=0; macOS packages require 13.5+.
  Framework APIs live in internal/app; native transport/policy in internal/desktop.
  Opaque business JSON uses TS contracts as the sole business schema authority.
- Build a prerendered SPA in dist/client and embed it under generated/frontend.
  Packaged routes use hash history; no frontend server runs in packaged apps.
  The root remains text-free; translated providers initialize inside ClientOnly.
- Launch only the absolute, version-matched bundled CLI at resources/bin/raypx.
  Stage the verified, prepared Bun executable and complete Herdr distribution;
  packaging must not rebuild or change the shared signed payload. On Windows,
  the CLI leases a complete versioned runtime copy before using terminal resources.
- macOS and Windows connect to the independent daemon. Interactive Quit lets the
  user leave active Agent tasks running or explicitly stop them before exiting.
  Spawn CLI children through Command so Windows opens no console. Terminal
  hooks remain daemon-only. Hide/minimize/quit releases UI approval leases.
- Renderer IPC cannot call host.*, approvals.local.watch, observed.remote or
  roots.register. Only native directory pickers grant roots. Connector recovery
  uses the bundled CLI and native-owned config directories. Validate external URLs.
- Cookie/Set-Cookie and restricted host credentials never enter renderer responses.
  Keep allowlisted paths/headers, deadlines, cancellation and encrypted profile
  session storage in the daemon. Sanitize errors. Persistence failure disables session transport; unreadable
  session storage keeps sign-in in memory and preserves stored rows.
- Load bounded runtime TOML from absolute RAYPX_HOME or ~/.raypx; invalid config
  stops startup. Only configured API origins are reachable. Isolate sessions,
  browser storage, remote settings and account-owned history by server origin.
- Daemon owns `desktop_sessions` in its existing profile SQLite. Native supplies
  the OS key through finite stdin/private IPC, scoped to canonical native/profile
  directories in the new `raypx-desktop-session-v1-` namespace. Never read/import/
  delete old Go session stores or keys. Missing keys preserve rows and allow memory
  sign-in. `local_profile` selects the CLI profile explicitly (default `default`).
  Every rebootstrap retries the key. Settings recovery uses native Retry/Reset/Cancel;
  only native-confirmed reset may replace the key and clear all origins' sessions.
  Preserve independent Host credentials and all non-session profile data.
- Renderer uses a separate bounded loopback WebSocket with one-use capability,
  exact owned Origin/Host and first-frame authentication. Go holds a distinct narrow
  native capability; no business/API proxy or event queue. Native bootstrap remains
  available after a channel failure for explicit version-mismatch recovery.
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
- Turbo owns JS task scheduling and caches; Go owns native compilation caches. Default build
  checks/builds the renderer. Explicit packaging stages renderer, CLI and Herdr and
  invokes MyGo uncached. Go host verification is explicit in the shared task graph.
- `mygo:check:docker` builds the scoped Dockerfile directly. BuildKit owns
  module/layer caches and Go owns compilation caches; this opt-in headless check
  requires Docker, no JS dependency install and no staged renderer/CLI.
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
mygo:check/mygo:test (including the native_smoke build) and CI on the affected native platforms. Renderer-only changes
need no native runner. Release preparation adds build:desktop, mygo:smoke (headless),
package:desktop and repository verify --full. Go policy tests need no GUI.
For races: go test -race ./internal/... ./tests/native/host/....

native:smoke builds the separate MyGo host/renderer and checks CLI handshake,
local tools/terminal, daemon channel throughput, server isolation, restart/persistence
and tray. Quiet mode uses inactive windows and suppresses notifications/dialogs;
interactive mode adds focus/close/resize acceptance on isolated CI. Windows hosted
CI installs/uninstalls the actual per-user NSIS package and verifies payload hashes.

native:agents is an opt-in real-provider gate. It requires
RAYPX_LIVE_AGENTS=1 and isolated data and consume provider inference.
The Agent gate defaults to Codex; RAYPX_LIVE_AGENT_PROVIDERS optionally selects
codex, claude or both. Successful native Agent results, including provider versions,
are recorded under the repository's .artifacts/native-agents directory after cleanup.
HTTPS session persistence must use a real or synthetic HTTPS API; loopback HTTP is not proof of
production cookie persistence. Never count an unrun native platform as passed.

## Catalog composition

Own files, terminal, engine, command and localWorkspace in private `locales/<language>/` files.
Explicitly compose the nine shared package language entries with these namespaces.
Infer app translation types from the English entry; shared views read the same
messages context through their private typed hooks.
