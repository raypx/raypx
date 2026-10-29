# desktop

## Purpose

Tauri desktop composition root with a React/Vite renderer, persistent WebView, tray and bundled local CLI.

## Interface

`src-tauri/src/lib.rs` owns window, tray, trusted renderer commands and local engine lifecycle. `bridge.ts` declares the renderer bridge. `src-tauri/src/engine.rs` adapts NDJSON to the bundled binary. The renderer is a TanStack Start SPA: file routes live in `src/routes`, `src/router.tsx` exports `getRouter` and provides a TanStack Query client (account caches removed on sign-out), `src/components/shell.tsx` fills the `@raypx/blocks/shell` window frame, and the build writes `dist/client` for the native app origin.

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
Task renderer tests separate conversation, history and drafts with per-case fixtures; shared relay tests live in Host. Native transport and policy tests live in `src-tauri/tests/`; they exercise real
subprocesses and OS locks with Cargo. TS native smoke drivers use Bun types. `tests/native/smoke/` contains the
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

- `src-tauri` owns the Rust window/tray, lifecycle, encrypted API transport and CLI
  bridge. `bridge.ts` declares the universal renderer vocabulary. Rust transports
  opaque business JSON; TS contracts remain the only business schema source.
- Builds use Tauri with WKWebView/WebView2. The Electrobun host, SDK and renderer
  adapter have been removed; retain its policy fixtures for the Rust tests.
- Start produces only a prerendered SPA (`dist/client`). No server runs at runtime.
  The root remains text-free; translated providers initialize inside ClientOnly.
  Packaged native origins use hash history. Never edit generated route trees.
- Launch only the absolute bundled CLI with a matching version/build identity.
  macOS and Windows connect to an independent daemon; Quit preserves Agent work.
  Spawn CLI children through `engine::cli_command` so Windows opens no console.
  `__raypxTerminalHooks` (daemon hosts only) gates local terminal UI.
- Renderer IPC cannot call host.*, approvals.local.watch, observed.remote or
  roots.register. Directory grants come only from Rust's native picker. Connector
  recovery runs only the bundled CLI with native-owned directories.
- Cookie/Set-Cookie and restricted host credentials never enter renderer responses.
  Rust owns API paths/headers, deadlines, cancellation, AES-GCM persistence and OS
  keyring access. Storage errors are sanitized; failed persistence disables the
  session transport. Temporary key-service failures must preserve encrypted files.
- Load bounded runtime TOML from absolute RAYPX_HOME or ~/.raypx. Invalid configuration
  stops startup. Only configured API origins are reachable through native HTTP;
  renderer input cannot choose destinations or authentication headers.
- A lifetime SQLite exclusive lock in desktop-instance.sqlite also excludes old
  Desktop versions. Never unlink an owned lock file. Preferences stay device-local;
  session and renderer storage keys are scoped by normalized API origin.
- Native only reports raw preference JSON and read/missing/unreadable. Renderer
  validates theme, locale and analytics. Only missing files may migrate browser
  values; unreadable files use defaults without automatic rewriting. Serialize
  complete preference updates and atomically preserve other top-level fields.
- Only the main window's bundled origin and localhost development view receive IPC.
  Capabilities grant application commands only, never fs/http/shell/plugin powers.
  Validate HTTP(S) external links in Rust before opening the system browser.
- CSP hashes prerendered startup scripts and permits Tauri IPC. Keep terminal,
  theme and IPC checks in packaged smoke after CSP changes.
- Native event streaming uses bounded buffers and acknowledged Channel credit.
  Approval leases renew only while engine-ready, visible and not minimized; hiding
  or quitting releases the lease before stopping the engine.
- Bun/VP own JavaScript tasks. Default build constructs only renderer assets;
  package:desktop explicitly builds CLI, stages the target-triple sidecar and runs
  Tauri uncached. Default Bun verification requires no Rust/WebView SDK.
- Only `tauri build`/`bundle` merge `src-tauri/tauri.bundle.conf.json`, which
  declares the sidecar and pinned Herdr resources; route them through `scripts/native/tauri.ts`. Dev builds
  launch the staged `src-tauri/binaries` CLI so CLI rebuilds do not rerun Cargo.
- CLI's `prepare:herdr` stages the checksum-verified complete native distribution
  beside the development CLI. Packaged resources live under `herdr/`; CLI copies
  them into the profile before starting terminals so Windows updates retain no
  running Herdr executables or ConPTY DLLs in the application bundle. The renderer
  displays complete/incremental screen frames; scrolling and paste route to Herdr.
- native-smoke exists only in an explicit Cargo feature. Its random-token private
  socket drives release WebViews; normal builds expose no eval/debug commands.
  Keep Cargo smoke outputs separate under target/native-smoke.
- Local automated tests must stay quiet and avoid activating windows or switching
  the user's desktop. Run foreground acceptance on isolated CI runners unless the
  user explicitly requests a local interactive run.
- Unsigned builds, unrun platforms, live-provider gates and skipped foreground UI
  checks must be reported accurately. Linux Desktop remains unverified.

## Verification

`bun run --cwd apps/desktop check`, `bun run --cwd apps/desktop test`, `bun run build:desktop`, then `bun run package:desktop`.

`bun run --cwd apps/desktop native:smoke` runs packaged assets, the renderer file/task/terminal bridge, CLI handshake, tray lifecycle and a full process restart for device preferences and local state. It uses `RAYPX_NATIVE_SMOKE=1` with the `shell` then `restore` phases. Default `quiet` presentation uses inactive windows and suppresses notifications/dialogs; native close/resize/focus acceptance is skipped. `native:smoke:interactive` explicitly enables those GUI checks. `write` then `read` with a synthetic HTTPS API verifies actual packaged-origin session persistence and logout. Never count loopback HTTP as production cookie verification. Tests use the isolated smoke identity, WebView partition and local profile. Smoke bundles are named `Raypx Test` and built under `target/native-smoke`; release bundles remain `Raypx`.
Shell/restore assert signed-out local access, then use an isolated loopback session fixture. The runner switches runtime TOML servers to check cookie/storage and remote opt-in isolation. These phases do not validate authentication; runtime code contains no fixture. Real HTTPS uses the separate beta phases.
Temporary Windows smoke installers disable NSIS compression; production installers retain
the LZMA default. Smoke still installs the real package and checks its payload hashes.

`RAYPX_LIVE_AGENTS=1 bun run --cwd apps/desktop native:agents` runs real Claude and
Codex through Desktop's LocalEngine and the standalone CLI in temporary projects.
It uses existing provider authentication and consumes inference usage. It checks
plan rejection/approval, generated tests, session resume after restart and child
process cancellation. It is opt-in and outside default verification.
`native:beta` plus E2E `e2e:live` use a separately provisioned test account and
isolated native data directory against an actual HTTPS deployment. The beta native
phases cover packaged form login, hidden relay execution, process restart and
logout. See docs/development/testing.md.

## Remote tasks

`/memory` defaults to device-owned references; the account tab uses RemoteBoundary.
Keep the local form across tab/account changes without uploading or migrating it.
Inject only the matching library; legacy account-local editors stay isolated.
Cloud schedules use account references; task snapshots survive source changes.

Tasks and approvals default to This computer. `features/tasks/local-client.ts`
adapts private `agents.local.*` IPC to the shared task view interface and subscribes
to native change events. New work uses reserved `LOCAL_WORKSPACE_ID` in the CLI profile;
tasks/approvals stay in SQLite, never enter the outbox and remain separate from remote work. The
remote tab alone uses the API task client. Local creation needs project authorization
and an installed provider, with no login or grant. Native does not server-prefix the
reserved owner; legacy history stays server/account-scoped and logout cancels only that legacy work.
Native shows the pending-task notification for `agent.changed` events carrying
`pendingRequest`; Agent settings can clear finished local history. The sidebar
approval count combines local and remote approvals.

`src-tauri/src/control.rs` bootstraps the CLI host on both supported platforms through Native-only host
RPCs. Credentials go directly to private IPC and Keychain, never the renderer.
The independent daemon renews short grants without browser cookies. Missing browser
sessions and renderer unmount do not revoke authorization; explicit account sign-out
uses `features/tasks/host-session.ts`, and account/origin changes detach the old binding. Host bootstrap needs recent sign-in; settings' shadcn password dialog refreshes it without logout or daemon detachment.

Local terminal settings/connectors require no account. Hooks return native control
on failure; only recorded Bash permissions are enabled, and Codex requires trust.
Modified owned binaries need explicit backup/replacement confirmation. Repair uses
the bundled CLI and Native directories, never a renderer-selected source.
Timeouts are uncertain and never retried automatically.

## Browser analytics

`features/analytics` injects public build config and a device-local preference store
into `@raypx/analytics`. Keep the SDK deferred and auth/account dependencies outside
the document root. Route catches and React/global errors pass only sanitized app
frames. Statistics and errors default off independently; identify internal IDs only
with statistics consent, reset on logout and never capture raw task parameters.
Restore analytics through getAnalyticsPreferences with a five-second RPC timeout;
keep capture disabled until the latest Native value arrives, never authorize from preload.
Source-map upload is an explicit release step using those same assets.
Engine mismatch recovery confirms cancellation before replacing the old daemon. Native forwards loaded `[connectors]` paths/environment; settings show actual destinations and owned-binary repair/update.
Older servers use browser-renewed managed-only grants, with terminal approvals disabled.
`features/onboarding/welcome.tsx` guides authorization, agent detection and opening the editor; empty Files, `/welcome` and Settings open it. Never auto-execute or enable remote. Local drafts use the device owner; legacy/remote slots retain server/account WebView scope.
Local approvals require no account. Native leases `approvals.local.watch` only
while ready/visible/unminimized; renderer cannot call watch/host.*. Local RPC never
accepts origin/account. Cloud opt-in scopes are local subsets. Prefer local
`(id, epoch)` over cloud revisions; uncertain decisions never switch channels.
