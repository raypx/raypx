# ADR 0036: Tauri Desktop transport and native policy host

Superseded on `next` by [ADR 0038](0038-mygo-desktop-host.md).

Status: implemented, 2026-10-27.

The maintenance costs of the Electrobun SDK projection, transport workarounds and
Windows CEF cookie implementation justify the migration. Tauri 2 replaces the
native Bun host with Rust and system WKWebView/WebView2. The bundled Bun CLI
continues to own execution, schemas, credentials, relay and provider integrations.
This decision replaces ADR 0020's runtime choice;
its security requirements and ADR 0035's local ownership rules remain in force.

Rust owns bounded IPC, origin/method/path policy, native window/tray/dialogs,
encrypted cookies and configuration. Business JSON remains opaque. TS validates
local events and device preferences; shared fixtures and generated command/method
manifests prevent policy drift. Renderer application calls retain their existing
`getBridge().request.method(input)` shape. Native event delivery uses acknowledged
Channel credit to bound outstanding terminal data.

macOS and Windows use an independent daemon with OS Keychain or Credential
Manager ([ADR 0037](0037-windows-daemon.md) replaced the Windows foreground owner). Browser session expiration does not revoke restricted host credentials;
explicit sign-out/account changes revoke the affected binding.

The chosen installation target is per-user NSIS. Existing Windows encrypted
sessions and WebKit sessions are not imported: users sign in again. Preferences,
CLI profiles, grants and history remain local. WebView keys include the selected
server origin; unsent drafts from the old shell are not migrated. The release
notes must explain the one-time sign-in and draft loss.

Default `bun run verify` stays free of Rust/WebView development prerequisites.
Desktop packaging and its macOS/Windows CI jobs explicitly stage the matching
CLI and run Cargo checks. Ubuntu Rust jobs exclude `raypx-desktop`; Linux Desktop
support remains unverified. Cargo tasks run uncached in VP.

Rust cloud calls use an `orpc-client` custom Link through the native HTTP policy
transport. The renderer IPC remains independent; no Rust business schemas or
unbounded upstream subscription queues are introduced. JSON-only envelopes are
checked against the TS oRPC version in a loopback interoperability fixture.

Formal builds do not compile `native-smoke`. Dedicated release smoke builds use
an isolated identifier, target directory and a private token-authenticated socket.
Only that feature enables eval/lifecycle automation; renderer capabilities grant
no plugin filesystem, shell, HTTP or updater permissions. Signed updates are
checked and confirmed through the native host.

The Electrobun shell, SDK projection and renderer adapter have been removed. On
2026-10-27 the user explicitly deferred signing, notarization and acceptance that
requires unavailable account credentials. Those checks remain unverified and must
pass before signed distribution; unsigned packages establish build and local
runtime behavior only. The same source can be recovered from Git history.

Current CLI service installation uses a stable installed CLI path. Detect and
verify the actual registered executable; do not automatically install launchd
because an older planning document expected an app-bundle path.
