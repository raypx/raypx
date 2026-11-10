# ADR 0038: MyGo desktop host

Status: accepted; current Desktop host.

Desktop session/API/event transport superseded by [ADR 0052](0052-daemon-desktop-channel.md).

MyGo v0.8.3 hosts the React SPA and native DesktopBridge, and packages the
standalone Bun CLI. The independent CLI daemon owns execution. Go 1.27.3 builds
the native host with CGO_ENABLED=0.
The renderer remains React/HTML; MyGo supplies windows and native services rather
than a Go-rendered widget tree. `mygo.config.ts` sets macOS 13.5 as the minimum,
matching the pinned Go host and embedded Bun runtime. macOS uses WKWebView,
Windows uses WebView2. Linux compiles but native acceptance
is still required before claiming support.

`apps/desktop/internal/app` adapts windows, tray, dialogs and trusted
MyGo calls. `internal/desktop` implements framework-independent native policy,
allowlisted HTTP/oRPC, server-scoped cookies, preferences, event credit, instance locks
and NDJSON transport. TS contracts remain the business schema authority. Raypx
keeps its existing raw DesktopBridge JSON and acknowledged event transport; generated Go bindings do not
become a second business schema. The current app owns one main window. Framework
multi-window support does not imply a shipped multi-window product flow.

Packaged pages use `mygo://<server-scope>/` (Windows maps this to
`http://<server-scope>.mygo.localhost/`). Only the owned main page can invoke
Desktop services. External navigation/popups are refused. Local tools require
one-time instance enrollment, then remain usable offline and after online logout. Remote Host
authorization is separate; online sessions remain native and server-scoped.

The application embeds the built frontend and generated manifests. Resources
include the compiled, version-matched CLI and complete verified Herdr runtime.
GUI Quit releases UI approval leases and closes only its daemon proxy. The daemon
continues running tasks. Data paths and the SQLite cross-version instance lock remain
stable. Go owns a separate `sessions.sqlite` holding each server scope's persistent
cookies as AES-GCM ciphertext authenticated against the scope. The lifetime
`desktop-instance.sqlite` transaction never shares this writer. MyGo Secrets keeps
the key for the Desktop data directory in the system credential store. An unavailable
key or unreadable ciphertext leaves stored rows intact and permits in-memory
sign-in. Private POSIX permissions and a restricted inheritable Windows DACL still
protect the database files. The upgrade clears the previous plaintext session rows
and requires signing in again. Old `credentials.sqlite` and `session-v2.enc` files
are never read, imported or deleted.

`native_smoke` is a separate Go build tag. Only that build exposes the private
random-token test endpoint; `mygo:check`/`mygo:test` compile it alongside the
production host. The endpoint offers renderer eval, engine/API requests, window
state with native focus and activation counts, tray actions and the stream/CORS probes; scenarios
read state on demand instead of mirroring it. Its renderer is built in `native-smoke` mode with a
stream observation hook; production compilation removes that branch. App identity,
WebView/data paths and package outputs are isolated. Startup validates the owned
profile and its config directory before opening config, credentials or locks. The release gate checks Go
module/build metadata and actual embedded bytes for accidentally shipped controls.

Bun/VP owns JS tasks and caches. Go owns native compilation caches. Normal CI
checks sources/transport/Herdr. Explicit distribution
runs package and native GUI acceptance in parallel on macOS and Windows, including
per-user NSIS installation on hosted Windows runners.

Signed updates use MyGo updater keys and manifests.
Unsigned/ad-hoc packages are development artifacts. Developer ID/notarization,
Authenticode and native GUI acceptance must be
verified in their actual environments before release; local headless checks do not
establish those results.
