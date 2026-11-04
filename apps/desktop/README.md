# Raypx Desktop

MyGo v0.7.4 hosts the existing React SPA and launches the standalone Bun CLI.
Go 1.27.3 builds with CGO_ENABLED=0. The CLI owns execution and the independent
daemon; Herdr remains the terminal runtime. The UI remains React in WKWebView
(macOS) or WebView2 (Windows). `mygo.config.ts` targets macOS 13.0+. Linux Desktop
acceptance remains unverified. The current application uses one main window.

- `main.go`: embedded frontend/manifests and entry point.
- `internal/app`: MyGo lifecycle, trusted IPC, windows, tray and native dialogs.
- `internal/desktop`: native policy, HTTP/session persistence, CLI and event transport.
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
accept an EngineClient port, while process framing and compiled CLI acceptance stay
in the native gates. See the testing guide for the selected macOS/Windows matrix.
Go policy checks do not require staged renderer files. `mygo:check`/`mygo:test` also
compile the `native_smoke` build and run its protocol tests. Go tests generate contract
manifests and use temporary profiles. `RAYPX_MYGO_CLI` optionally selects an absolute
compiled CLI for the daemon integration test; only its isolated daemon is stopped.

`native:smoke` builds a separate `native_smoke` Go host and renderer in
`artifacts/native-smoke` and `build/native-smoke`. Quiet presentation stays inactive.
`native:smoke:interactive` also checks native focus/resize/close; use isolated CI.
Normal production builds exclude the private endpoint and renderer test hook.

Register the local instance once to one account and API origin. Its signed
identity allows local work offline and after online logout. Remote access needs
separate Host opt-in and online authorization. On macOS/Windows, GUI Quit leaves
the daemon and its tasks running; explicit daemon shutdown stops its owned work.

Native uses the current data paths and device preferences.
Native persistent Cookies are encrypted in server-scoped rows of `sessions.sqlite`.
MyGo Secrets keeps the key in the system credential store. Upgrading from the
plaintext session format clears the saved online session and requires signing in
again. If the vault is unavailable, sign-in lasts only for the running app.
CLI identity and Host credentials stay in its `profile.sqlite`. POSIX files use
private permissions; Windows uses restricted DACLs. Old credential stores are
never read, imported or deleted. Existing profiles without their database key
remain unavailable; select a new `local_profile` explicitly to register again.
MyGo signed updates use distinct
keys and manifests. Local unsigned or
ad-hoc packages do not establish distribution signing, notarization or GUI results.

Desktop-only browser acceptance lives in `e2e/`; run it through
`bun run test e2e --desktop -- --grep settings` from the repository root. Shared
Web/Desktop journeys remain in the root `e2e/` workspace. Browser preview tests
do not replace packaged native acceptance.
