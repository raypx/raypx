# MyGo Desktop host

Go composition root for the existing React SPA and version-matched standalone
Bun CLI. No self-drawn UI. Framework APIs belong in app/; desktop/ owns transport and native policy without
importing MyGo. main.go at the app root only embeds assets and calls app.Run. Keep DesktopBridge wire
contracts and JSON business payloads. Launch the bundled CLI by absolute path;
never require an installed Bun or Node. Quit closes only the daemon proxy.

Keep credentials/cookies native, API origins and renderer methods allowlisted,
IPC limited to the owned main page, event delivery bounded and acknowledged,
and directory grants owned by the native picker. Preserve the existing SQLite
instance lock, data paths and encrypted-session format. Dependencies must build
with CGO_ENABLED=0. Generated assets and binaries stay ignored.

Tests live in ../tests/native/host/. From apps/desktop run
`go test -race ./internal/... ./tests/native/host/...` and `go vet ./...`, then
the repository Bun verification. Headless artifact checks must use temporary profiles and never
read production credentials or activate a GUI. Report unrun packaged GUI/platform
checks accurately.
