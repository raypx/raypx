# Raypx Desktop

The canary branch uses Tauri 2.12.5 and Rust 1.99.1 to host the React SPA in
WKWebView or WebView2. The standalone TypeScript CLI/daemon owns execution and
scheduling. Its production executable embeds stable Bun 1.4.4, minified ESM and
depth-0 bytecode. Desktop includes the complete verified CLI/Herdr payload and
works without a separately installed CLI, Bun or Node.js. macOS requires 13.5+;
Linux Desktop acceptance remains unverified.

- `src-tauri/src/shell.rs`: windows, tray, notifications, picker and trusted IPC.
- `src-tauri/src/host.rs`: native policy, authorization and daemon proxy lifecycle.
- `src-tauri/src/{api,sessions,engine,events,config}.rs`: native adapters.
- `src/lib/tauri.ts`: invoke/channel adapter behind `DesktopPlatform`.
- `scripts/host`: generated contracts, staging, signing and build orchestration.
- `tests/native/smoke`: isolated packaged GUI acceptance.

From the repository root:

```sh
bun run --cwd apps/desktop check
bun run --cwd apps/desktop test
bun run --cwd apps/desktop tauri:check
bun run --cwd apps/desktop tauri:test
bun run build:cli
bun run build:desktop
bun run package:desktop
bun run verify
```

VP owns the task graph. Normal Desktop builds check and render the SPA. Explicit
packaging verifies and copies the prepared Bun CLI payload, then invokes Tauri.
Installers live in `target/release/bundle`; matching CLI resources are required
for every target. Root `bun run dev:desktop` starts Tauri and Vite. Cargo owns native compilation.
`tauri:check:docker` generates policy then runs core Rust tests in a scoped Docker
context. It does not establish GUI acceptance.

`tauri:check` runs formatting, compilation and Clippy; `tauri:test` runs policy,
SQLite lock and real process tests. Linux uses the framework-independent core.
`native:smoke` and `native:smoke:interactive` build a separate application identity,
renderer and Cargo feature under `target/native-smoke`. The private test endpoint
is excluded from production. Interactive acceptance runs only on isolated runners.
Windows hosted runners install and uninstall the actual per-user NSIS package and
verify the complete runtime inventory.

Main pages use History paths. Settings is a global `#settings` dialog over the
current path and query; opening it preserves the mounted page and its drafts.
The Terminal tool opens the daemon's default shell in the selected project's
directory only after an explicit click. Advanced options accept a custom executable,
arguments and directory; without a project, a directory must be entered.

`desktop-instance.sqlite` prevents concurrent hosts. Native owns
`tauri-sessions.sqlite` and a separate system credential key; device preferences,
connection settings, profile data and offline enrollment remain local. Missing
cookie keys preserve stored ciphertext and allow in-memory sign-in. POSIX
permissions are private; Windows uses restricted inheritable DACLs.

Quit disconnects the proxy and releases UI approval leases. Daemon tasks keep
running. Only explicit daemon shutdown stops its owned work. Remote grants and
online sessions remain separate from offline instance enrollment.

Before replacing an installation, quit Desktop and explicitly stop its daemon.
Release installers require platform signing. Automatic updates also require
Tauri signing keys and an HTTPS update manifest. Platform installer, GUI and
signing checks, plus macOS notarization, are separate release gates; an unsigned
package or a source test pass does not establish them. See [the Desktop guide](../../docs/development/desktop.md).
