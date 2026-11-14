# Raypx Desktop

MyGo v0.8.3 hosts the shared server-owned Agents workspace in a system WebView.
Go 1.27.3 builds with `CGO_ENABLED=0`. Desktop targets macOS 13.5+ and Windows;
Linux Desktop acceptance remains unverified.

Sign in through the system browser to work with Spaces, direct/group conversations,
durable Runs, approvals, computer files, routines and memory. Pages supports edits,
versions and sharing, with authenticated previews handed off to Web. Account settings
compose model connections, Skills and Tools. Packaged routes use hash history;
Settings preserves the route and drafts beneath its overlay.

The bundled CLI/daemon still owns encrypted native sessions and transport, plus
retained device execution, enrollment, scheduling and terminal capabilities. Those
are separate from backend Agent Runs until their replacement phase. The old
project/session, Files, Terminal and Automations screens are removed.

- `main.go`: embedded frontend/manifests and entry point.
- `internal/app`: MyGo lifecycle, trusted IPC, windows, tray and native dialogs.
- `internal/desktop`: OS capabilities, finite CLI bootstrap and narrow native IPC.
- `src`: existing renderer; `bridge.ts` declares its native vocabulary.
- `resources`: maintained icons/entitlements, plus generated `bin` payloads.
- `tests/native/host`: quiet Go transport/policy tests.

From the repository root:

```sh
bun run --cwd apps/desktop check
bun run --cwd apps/desktop test
bun run --cwd apps/desktop test:unit
bun run --cwd apps/desktop test:component
bun run --cwd apps/desktop test:integration
bun run --cwd apps/desktop mygo:check
bun run --cwd apps/desktop mygo:check:docker
bun run --cwd apps/desktop mygo:test
bun run build:cli
bun run build:desktop
bun run --cwd apps/desktop mygo:smoke
bun run package:desktop
bun run verify --full
```

`mygo:smoke` is a headless artifact check and opens no window. `package:desktop`
stages matching renderer, CLI and Herdr inputs, then packages under
`build/<os>-<arch>`. `dev:desktop` starts MyGo with the Vite renderer server.
Cross-platform packages require matching CLI artifacts and are currently rejected.
`test:unit` and `test:component` use isolated platform fixtures without native tools,
real accounts or Provider processes. `test:integration` owns build/package script
tests; default `test` runs all three Vitest projects. Go policies and host use cases
accept a NativeClient port, while finite subprocess/IPC and compiled CLI acceptance stay
in the native gates. See the testing guide for the selected macOS/Windows matrix.
Go policy checks do not require staged renderer files. `mygo:check`/`mygo:test` also
compile the `native_smoke` build and run its protocol tests. Go tests generate notification
copy and use temporary profiles. `RAYPX_MYGO_CLI` optionally selects an absolute
compiled CLI for the daemon integration test; only its isolated daemon is stopped.

`mygo:check:docker` runs the existing Go checks in
Docker BuildKit with pinned Go/Bun, without installing JavaScript dependencies.
Its scoped context contains only the native check inputs. BuildKit caches the
`go.mod`/`go.sum` download layer and retains both `GOMODCACHE` and `GOCACHE` across
source edits. Reuse the same builder; `BUILDX_BUILDER` or `--builder <name>` selects
one. Source edits rerun checks while reusing the Go caches. Turbo leaves this task
uncached so Docker owns its layers and Go owns incremental compilation.
Ephemeral CI builders need separate persistence for cache-mount contents; exporting
image-layer caches alone does not retain them. This command performs headless Go
vet/compilation for production and `native_smoke`, without running tests or a GUI.

`native:smoke` builds a separate `native_smoke` Go host and renderer in
`artifacts/native-smoke` and `build/native-smoke`. Quiet presentation stays inactive.
`native:smoke:interactive` also checks native focus/resize/close; use isolated CI.
Normal production builds exclude the private endpoint and renderer test hook.

Register the local instance once to one account and API origin. Its signed
identity allows local work offline and after online logout. Remote access needs
separate Host opt-in and online authorization. On macOS/Windows, GUI Quit leaves
the daemon and its tasks running; explicit daemon shutdown stops its owned work.

Native uses the current data paths and device preferences.
The daemon encrypts persistent Cookies in its existing profile SQLite database.
MyGo Secrets supplies a key scoped to the canonical native/profile directories
through finite private bootstrap. The renderer calls the daemon directly over an
independently authenticated loopback WebSocket; Go holds only native capabilities.
Missing keys preserve stored rows and permit sign-in in daemon memory. A failed
write disables session transport until daemon restart. Previous Go session stores
and keys are never read, imported or deleted. CLI identity and Host credentials
stay in its profile; preferences and the lifetime native instance lock stay local.
MyGo signed updates use distinct
keys and manifests. Local unsigned or
ad-hoc packages do not establish distribution signing, notarization or GUI results.

Desktop-only browser acceptance lives in `e2e/`; run it through
`bun run test e2e --desktop -- --grep settings` from the repository root. Shared
Web/Desktop journeys remain in the root `e2e/` workspace. Browser preview tests
do not replace packaged native acceptance.

See the [single-compile distribution and Strobe acceptance guide](../../docs/development/mygo-bun-migration-plan.md) for prepared payloads and remaining platform gates.
