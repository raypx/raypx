# desktop

## Purpose

Electrobun desktop composition root with a React/Vite renderer, persistent WebView, tray and bundled local CLI.

## Interface

`native/main.ts` owns window, tray, trusted renderer RPC and local engine lifecycle. `native/rpc.ts` declares the renderer bridge. `native/engine.ts` adapts NDJSON to the bundled binary. The renderer is a TanStack Start SPA: file routes live in `src/routes`, `src/router.tsx` exports `getRouter` and provides a TanStack Query client (account caches removed on sign-out), `src/components/shell.tsx` fills the `@raypx/blocks/shell` window frame, and the build writes `dist/client` for `views://main`.

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
translated feedback and submission state; the renderer owns navigation. Keep
renderer tests under `tests/renderer/unit/` and `tests/renderer/component/`,
then mirror feature and route directories.
Native tests use `tests/native/` with Bun types; `tests/native/smoke/` contains the
packaged scenario, selected by Electrobun only with `RAYPX_NATIVE_SMOKE=1`.
Native scripts/tests live in `scripts/native/` and `tests/scripts/native/` with Bun types.
All tests stay outside `src/routes/` discovery and the renderer configuration.
Use short feature-local filenames such as `form.tsx` and `routes.test.tsx`;
exported symbols retain feature context. Test scripts select `component/` and
`integration/` directories; `test:unit` excludes those directories. File extensions
describe source syntax, and each suite declares its required test environment.

The account route reads its remote projection in a client-only loader; auth
mutations invalidate route data on success. Keep Better Auth session updates as
invalidation signals rather than a second account-query state machine.
Local tools render during session/network checks. Auth routes use a standalone layout; `RemoteBoundary` gates private views and returns to an allowlisted destination. Logout returns to local tools. Keep the coordinator mounted.

## Constraints

- Device `memory.*` IPC works before login without account namespaces. Renderer
  tasks use `agents.local.*`; internal relay/start/snapshot methods stay Native-owned.

- Start is used only for its SPA build. There is no server at runtime: no server functions, server routes or server-only loaders.
- The root shell is prerendered at build time without device preferences or native APIs. Keep it text-free; translated UI and providers start inside `ClientOnly`. Packaged views use hash history.
- `src/routeTree.gen.ts` is generated by the Start plugin during `dev`/`build`; commit it, never edit it, and do not regenerate it with `tsr`.
- Bundle the exact matching CLI version and start it through an absolute packaged path. Never use a global executable or PATH lookup.
- Closing hides the window. On macOS actual Quit closes only the daemon proxy; Agent
  tasks and scheduling continue. Logout/revoke cancels remote/legacy work, preserving device tasks; daemon
  stop cancels owned work. Windows retains foreground stdio cancellation on Quit.
- Engine failures show retry state; account, theme and language remain usable.
- Keep a persistent WebView partition. macOS uses WebKit; Windows bundles CEF with web security enabled.
- `native/api.ts` owns HTTP authentication and RPC cookies. macOS uses the SDK
  Session store in that same partition. Windows CEF has no SDK cookie implementation;
  `native/cookies.ts` owns an AES-GCM cookie jar with a per-server key in Windows
  Credential Manager (`Bun.secrets`, local persistence), never a plaintext key/file.
  `src/lib/api-fetch.ts` injects this transport into
  Better Auth and the API client; browser previews use ordinary fetch. WebKit can
  reject third-party cookies from `views://`, so do not rely on WebView fetch for
  signed-in API calls. Never return Cookie/Set-Cookie headers over the bridge.
  Native accepts bounded, allowed paths only at the API origin loaded from
  `~/.raypx/config.toml` by `native/config.ts`; renderer input cannot choose a
  destination or auth headers. The same origins reach the renderer through an
  immutable preload before auth/task clients initialize. `config.ts` is the pure
  shared connection contract. There is no environment-specific Desktop build.
  The file supports `base_url`, `web_url` and selected `profiles`, defaults to
  production, and requires a full Quit/restart after edits. Invalid input stops
  startup rather than connecting elsewhere. `RAYPX_HOME` optionally selects an
  absolute config directory; smoke tests use isolated config files.
  An optional `[ai]` table belongs to CLI's Pi model settings and does not change
  the selected account server; Desktop only requires that it is a table.
  Scope cookies/WebView storage, remote settings and legacy Agent account IDs to
  the normalized API origin, including port. Keep native device preferences and
  CLI file grants/jobs independent of the selected remote service.
- Acquire the per-user-data-directory instance lock before opening sessions.
  Instance ownership uses a lifetime SQLite exclusive OS lock in
  `desktop-instance.sqlite`; never unlink this file while another process may hold it.
  Process exit releases ownership without trusting PID metadata. Corrupt
  encrypted sessions or missing keys are quarantined and start signed out; a temporarily
  unavailable key service uses memory without replacing existing encrypted data. Show
  the recovery notice. Cookie response batches validate before mutation and roll back
  SDK failures; failed rollback disables that session's transport. Native owns the 30 s
  request deadline and renderer request IDs/cancellation. Never retry uncertain writes.
- Packaged HTML uses hashed startup scripts and a restrictive CSP. Validate HTTP(S)
  external links in Native before opening the system browser. Keep IPC, theme and terminal
  checks in the packaged smoke after CSP changes.
- Only bundled views and loopback development content receive native RPC. Renderer cannot register arbitrary directory grants; use native picker.
- Local file authorization does not sandbox external commands. Commands run with normal OS user permissions.
- Interactive terminals use xterm in renderer and Bun.Terminal in the separately compiled CLI. The Electrobun host keeps its pinned Bun version.
- Bun/Turbo own tasks. Hutch only prepares the pinned Electrobun SDK and packages native binaries.
- `check`, `build` and `dev` enter Turbo through `scripts/native/task.ts` when called
  directly. Inside a Turbo task they run only the leaf commands; never add inline
  `native:prepare` calls there. The task graph shares one preparation across the
  root verification's lint, checks and builds. Root `lint` alone remains a leaf.
  Direct script arguments use per-task `RAYPX_DESKTOP_*_ARGS` fields; cached tasks
  include these fields in their hashes, keeping renderer flags out of dependency builds. No arguments
  leaves the field unset so direct and root commands share cache entries.
- Keep `native:prepare` uncached: Electrobun's bootstrap and SDK projection also
  depend on external Hutch state and configurable release sources. After it
  completes, `desktop#check` hashes the projected SDK and declarations with JIT
  inputs; downstream builds inherit that hash. Do not cache the whole `.hutch`
  directory, which also holds platform binaries and native packaging state.
- SDK code and generated declarations remain ignored. Native strict checking uses generated declarations without weakening source checks.
- Theme/language are device preferences and survive logout. The host injects a
  validated snapshot directly through preload, distinguishing valid, missing and
  failed native reads. A valid native file is authoritative; only a missing file
  can migrate renderer storage, once at startup. Failed reads use safe defaults
  without automatically rewriting the file. Do not depend on localStorage for
  native restoration. Renderer initialization must finish before native writes;
  serialize complete theme/locale updates and preserve other persisted fields
  when writing atomically. The renderer's shared language provider resolves all
  system language candidates and owns no second locale state.
- Keep the independent Vitest configuration. Native GUI acceptance is a separate explicit platform gate.

## Verification

`bun run --cwd apps/desktop check`, `bun run --cwd apps/desktop test`, `bun run build:desktop`, then `bun run package:desktop`.

`bun run --cwd apps/desktop native:smoke` runs packaged assets, the renderer file/task/terminal bridge, CLI handshake, tray lifecycle and a full process restart for device preferences and local state. It uses `RAYPX_NATIVE_SMOKE=1` with the `shell` then `restore` phases. `write` then `read` with a synthetic HTTPS API verifies actual packaged-origin session persistence and logout. Never count loopback HTTP as production cookie verification. Tests use the isolated smoke identity, WebView partition and local profile. Smoke bundles are named `Raypx Test`, built under `.smoke-build.noindex`, and unregistered/removed at exit; release bundles remain `Raypx`.
Shell/restore assert signed-out local access, then use an isolated loopback session fixture. The runner switches runtime TOML servers to check cookie/storage and remote opt-in isolation. These phases do not validate authentication; runtime code contains no fixture. Real HTTPS uses the separate beta phases.

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

`native/daemon-control.ts` bootstraps the macOS daemon through Native-only host
RPCs. Credentials go directly to private IPC and Keychain, never the renderer.
The independent daemon renews short grants without browser cookies. Missing browser
sessions and renderer unmount do not revoke authorization; explicit account sign-out
uses `features/tasks/host-session.ts`, and account/origin changes detach the old binding. Host bootstrap needs recent sign-in; settings' shadcn password dialog refreshes it without logout or daemon detachment.
`native/control.ts` re-exports `@raypx/host` for Windows, retaining replay, connection fencing and renewal backoff.

`features/tasks/terminal-settings.tsx` installs/removes explicitly owned Claude/Codex
hooks and configures Away per authorized project. Default waiting is five minutes,
configurable from one to ten. Hook failures return native terminal control; only
recorded Bash permissions are enabled. Codex requires manual trust in `/hooks`.
Observed requests remain separate from managed tasks and share shadcn approval UI.

Connector failures show localized causes and status refresh. Modified owned binaries require explicit backup/replacement confirmation.
Native runs the bundled CLI's finite repair command with its own directories; never execute the modified installation or accept a renderer-selected source.
Timeout outcomes are uncertain; never retry automatically.

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
