# ADR 0038: MyGo desktop host

Status: accepted for `next`; supersedes ADR 0036 on this branch.

The React SPA, public DesktopBridge vocabulary, standalone Bun CLI and independent
execution daemon stay in place. MyGo v0.7.4 replaces the Tauri application crate,
renderer SDK and packager. Go 1.27.3 builds the native host with CGO_ENABLED=0.
macOS uses WKWebView, Windows uses WebView2. Linux compiles but native acceptance
is still required before claiming support.

`apps/desktop/internal/app` adapts windows, tray, dialogs and trusted
MyGo calls. `internal/desktop` implements framework-independent native policy,
allowlisted HTTP/oRPC, encrypted cookies, preferences, event credit, instance locks
and NDJSON transport. TS contracts remain the business schema authority.

Packaged pages use `mygo://<server-scope>/` (Windows maps this to
`http://<server-scope>.mygo.localhost/`). Only the owned main page can invoke
Desktop services. External navigation/popups are refused. Local tools need no
account; remote authorization and sessions remain native and server-scoped.

The application embeds the built frontend and generated manifests. Resources
include the compiled, version-matched CLI and complete verified Herdr runtime.
GUI Quit releases UI approval leases and closes only its daemon proxy. The daemon
continues running tasks. Data paths, the SQLite cross-version instance lock and
session-v2 AES-GCM cookie format remain stable. Go owns a separate `credentials.sqlite`
with server-scoped session encryption keys; the lifetime `desktop-instance.sqlite`
transaction never shares this writer. The injectable Keys port remains. Native storage
uses private POSIX permissions or a restricted inheritable Windows DACL. Old credentials
are never read, imported or deleted; an old cookie without its key requires sign-in.

`native_smoke` is a separate Go build tag. Only that build exposes the private
random-token test endpoint. Its renderer is built in `native-smoke` mode with a
stream observation hook; production compilation removes that branch. App identity,
WebView/data paths and package outputs are isolated. Startup validates the owned
profile and its config directory before opening config, credentials or locks. The release gate checks Go
module/build metadata and actual embedded bytes for accidentally shipped controls.

Bun/VP still owns JS tasks and caches. Go owns native compilation caches. The unused Rust crate experiment and its
Cargo toolchain have been removed. Normal CI checks sources/transport/Herdr. Explicit distribution
runs package and native GUI acceptance in parallel on macOS and Windows, including
per-user NSIS installation on hosted Windows runners.

MyGo updater keys/manifests are separate from the former Tauri updater protocol.
Unsigned/ad-hoc packages are development artifacts. Developer ID/notarization,
Authenticode and native GUI acceptance must be
verified in their actual environments before release; local headless checks do not
establish those results.
