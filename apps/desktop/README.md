# Raypx Desktop

Tauri 2.12.5 and Rust 1.99.1 host the React SPA in WKWebView or WebView2.
The standalone Bun CLI owns execution, scheduling and the independent daemon.
Desktop stages its compiled executable and Herdr as one verified payload. macOS
requires 13.5+; Linux Desktop acceptance remains unverified.

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
for every target. `dev:desktop` starts Tauri and Vite. Cargo owns native compilation.
`tauri:check:docker` generates policy then runs core Rust tests in a scoped Docker
context. It does not establish GUI acceptance.

`tauri:check` runs formatting, compilation and Clippy; `tauri:test` runs policy,
SQLite lock and real process tests. Linux uses the framework-independent core.
`native:smoke` and `native:smoke:interactive` build a separate application identity,
renderer and Cargo feature under `target/native-smoke`. The private test endpoint
is excluded from production. Interactive acceptance runs only on isolated runners.
Windows hosted runners install and uninstall the actual per-user NSIS package and
verify the complete runtime inventory.

Profile paths, preferences, TOML settings, migration journals and offline enrollment
remain unchanged. `desktop-instance.sqlite` prevents concurrent hosts. Tauri creates
`tauri-sessions.sqlite` and a separate system credential key. It never reads or
deletes previous-host login storage: sign in once after switching. Missing keys preserve
stored ciphertext and allow temporary sign-in. POSIX permissions are private;
Windows uses restricted inheritable DACLs.

Quit disconnects the proxy and releases UI approval leases. Daemon tasks keep
running. Only explicit daemon shutdown stops its owned work. Remote grants and
online sessions remain separate from offline instance enrollment.

The first Tauri version requires a signed installer after quitting the old host
and explicitly stopping its old daemon. New Tauri updater keys and manifests are
required; the previous feed is unused. Signing, notarization and macOS/Windows GUI
checks are release gates. See [the Desktop guide](../../docs/development/desktop.md)
and [Bun + Tauri experiment](../../docs/development/bun-tauri-experiment.md).
