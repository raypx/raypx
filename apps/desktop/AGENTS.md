# desktop

## Purpose

MyGo composition root with a React/TanStack Start renderer, system WebView, tray
and bundled Bun CLI. Read the root instructions, DESIGN.md and architecture guides.
`internal/AGENTS.md` owns the Go host; README.md lists native build commands.
Preserve DesktopBridge and never import CLI source.

## Renderer interface

Agents is the signed-in home. `/` redirects to `/agents`; login defaults there.
`@raypx/agents/model` validates Space/Agent selection and `/client` renders the shared
conversation workspace. Scope drafts and uncertain-send receipts by server origin,
account, Space and Conversation; restoration never sends. The native
`eventsOpen/Read/Send/Close` bridge reaches only the configured origin's `/events`.
The daemon owns cookies; the renderer applies and ACKs events. Browser previews
use the authenticated browser WebSocket. `eventsRead` retains its frame/null
results and adds `{ type: "closed", code, reason }` for remote termination. The
daemon validates UTF-8 reasons within 123 bytes and forwards only the public
Space/session endings with their expected codes; unknown endings stay generic.
Unread terminal results share the eight-stream bound and expire after 20 seconds.
The renderer forwards termination once to the shared socket port, stops polling
and suppresses late results after local close. Go only bootstraps the channel.
The shared Space menu and New Agent action occupy sidebar slots. The conversation
header opens the shared team-computer lifecycle/files panel; its API reads and commands
use the existing daemon-authenticated client without exposing credentials.
Still working keeps outside-window active Runs reachable with Stop, targeted
steering, addressed approvals and a bounded trigger-page jump. Tools settings
compose Web's Space-owner OpenAPI management, write-only credentials and explicit
operation/Agent availability through the existing API client.
Screen uses that shared panel and the bounded authenticated `/events` bridge;
control and pixels remain server-authorized and never enter native profile history.
Its expanded dialog reuses the same controller/stream. Escape releases control
first; once view-only, Escape closes the dialog and restores its opener.

Device pairing and directory grants use native-only `pairDeviceConnector` and
`grantDeviceDirectory` platform methods. Native fixes the API origin, picks the
directory and confirms trusted CLI-resolved account/Space metadata. Only a public
boolean returns to the renderer; connector credentials and one-use confirmations
remain in finite bundled CLI calls. The separate outbound connector daemon does
not reuse retained device task authority.
The existing native heartbeat polls its bounded pending directory-request queue.
Only the current daemon-verified account and configured origin may claim a request;
the host rechecks that session before the picker, dialog and final grant. Logout,
account changes and cancellation authorize no directory. Picker aliases whose
canonical path differs are refused and need a direct canonical selection.

The current renderer has no project/session editor, Waiting inbox, Automations,
Files, Terminal or local onboarding screen. Their native/CLI implementations remain
until later roadmap phases; do not reintroduce them as Agent execution. The
conversation header opens Space routines and memory sheets. The earlier
standalone device/account Memory route and navigation are removed.
Account and security, authentication, appearance, language, analytics and session
recovery stay available. Desktop has no embedded administration area; deployment
administration remains in Web.

Routes live in `src/routes`; the router supplies TanStack Query. Shell pages declare
`staticData.page` for translated titles and layout. Pages own one heading; the shell
adds no duplicate breadcrumb title. The shell owns outer widths and gutters. Search
contains only current pages and settings. Use existing UI primitives and Tailwind,
with English/Chinese labels, keyboard access and narrow layouts. Regenerate the
route tree with TanStack tooling; never edit it by hand.

Packaged routes use hash history. Settings is a lazy global dialog at the exact
`settings` fragment, for example `#/agents#settings`. Preserve the background path,
search, mounted drafts and scroll; close through the matching history entry or
remove only the fragment for a direct link.

`main.go` embeds prepared assets through `internal/app`; `internal/desktop` owns OS
capabilities and finite bootstrap. The SPA builds into `dist/client`. The root
prerender carries no translated text; device preferences initialize in ClientOnly.
`DesktopRuntimeProvider` retains daemon readiness for the current session
transport. Server Agent routes require that transport and an account session;
retained instance enrollment does not gate Agents or Devices. The separate local
runtime still enforces enrollment for its existing execution consumers.

## Ownership

Core/contracts own schemas. Renderer IPC uses `@raypx/contracts/local-client` to
infer and validate both sides, without caller-supplied reply generics. Platform ports
in `src/lib/platform.ts` are independently injectable; `desktop.ts` selects MyGo.
`preferences.ts` owns validation and `src/preferences.tsx` owns initialization.
The native preference snapshot takes precedence over browser storage.

Auth clients live in `features/auth`. Account reads use the direct API client and
client-only route loader. Better Auth session updates invalidate that route rather
than creating another profile state machine. Login uses the system browser and
configured OAuth endpoint; the daemon owns callback and token exchange. Resume only
allowlisted Agents or account destinations. Shared forms own fields and
feedback; the renderer owns navigation.

The root `DesktopSignOutProvider` owns explicit logout. Clear account caches after
web sign-out and retain failed native cleanup across route/gate changes. Retry
cleanup manually or on engine/network recovery without repeating web sign-out or
dropping device identity. Keep host revocation even though its task UI was removed.
Logout owns navigation while session notifications and stream closure race with
cleanup, including retained retries. Ordinary session expiry keeps its return
destination. Logout returns to login; preferences and CLI profiles remain local.

Development diagnostics use the private `@raypx/devtools` bridge under renderer
providers and `import.meta.env.DEV`. The Dock runs only in Vite serve. Do not add a
Go/IPC clipboard API; copy failures show selected JSON. Production/native builds
exclude the diagnostics bootstrap and panel.

Renderer tests are source-adjacent `*.test.ts` and `*.component.test.ts(x)`.
Route composition tests live beside the router. Shared fixtures stay under `tests/`;
components use happy-dom. `test:unit` and `test:component` need no CLI, Go, WebView,
secrets or provider installation; build/process cases belong to `test:integration`.
Browser acceptance in `e2e/` consumes `@raypx/e2e/testing` and public shared journeys.
It proves compiled renderer behavior, not native WebView acceptance. Native Go tests
and TS smoke drivers remain separate. Earlier native-tools smoke assertions await
replacement and must never be reported as Agents acceptance.

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

Explicitly compose common, auth, account, agents, jobs, memory, analytics, blocks and
instances language entries with private desktopLogin, engine and localWorkspace
catalogs. Infer app message types from English. Shared views read the same messages
context. Keep private copy only for current renderer behavior; native notification
asset generation consumes Tasks' public messages independently.

Pages mounts `@raypx/pages/client` at `/pages` in the shared Space/sidebar workspace.
Pages disables authenticated document frames through its explicit mount capability;
source drafts and one-time share links stay in component memory. Page invalidations
arrive through the shared Space stream. Asking about a Page only restores a composer
reference. Account settings compose Skills and remote Tools; Agent forms enable the
member's available resources. Remote credentials remain write-only.

Desktop passes `canEmbedAuthenticatedDocuments={false}` in every environment,
including browser acceptance. Pages keeps editing, versions, restore and sharing
available and offers Web preview at the configured Web origin. The handoff opens
the system browser through the native bridge, or a separate tab in browser builds.
It never copies cookies or recreates backend HTML in the renderer.
