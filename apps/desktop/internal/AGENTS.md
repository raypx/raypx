# MyGo Desktop host

Go composition root for the existing React SPA and version-matched standalone
Bun CLI. No self-drawn UI. Framework APIs belong in app/; desktop/ owns transport and native policy without
importing MyGo. main.go at the app root only embeds assets and calls app.Run. Keep DesktopBridge wire
contracts and JSON business payloads. Launch the bundled CLI by absolute path;
never require an installed Bun or Node. Quit closes only the daemon proxy.
The main window uses MyGo's hidden title bar on every route and keeps native
window buttons. The renderer reserves their insets using MyGo's CSS variables.

Keep credentials/cookies native, API origins and renderer methods allowlisted,
IPC limited to the owned main page, event delivery bounded and acknowledged,
and directory grants owned by the native picker. Preserve the existing SQLite
instance lock and data paths. Dependencies must build
with CGO_ENABLED=0. Generated assets and binaries stay ignored.

Go owns server-scoped persistent Cookies in `sessions.sqlite`, independently of the
lifetime instance-lock transaction. The cookie jar depends only on the SessionStore
port. The app supplies the AES-GCM key through MyGo Secrets. Unavailable keys keep
the session in memory. Preserve private POSIX permissions and restricted inheritable
Windows DACLs. Clear the superseded plaintext session format without importing it.
Never read/import old credentials. `Config.LocalProfile` selects the bundled CLI profile only.

Tests live in ../tests/native/host/. From apps/desktop run
`go test -race ./internal/... ./tests/native/host/...` and `go vet ./...`, then
the repository Bun verification. Headless artifact checks must use temporary profiles and never
read production credentials or activate a GUI. Report unrun packaged GUI/platform
checks accurately.

Desktop depends on EngineClient and receives CLI metadata and dependencies through
Options. Keep concrete process framing in Engine and event credit in EventStream.
Pure renderer policy tests live beside policy.go without opening profiles or processes;
host use-case tests inject an engine. tests/native/host retains real transport,
subprocess, OS-lock and compiled CLI acceptance. Test ports must preserve native
authorization and request admission rather than bypassing them.
