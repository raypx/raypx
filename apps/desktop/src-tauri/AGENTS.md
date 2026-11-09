# Tauri native host

Rust owns trusted main-WebView IPC, native HTTP/session policy, the picker,
notifications, window/tray lifecycle and the absolute-path CLI proxy. Execution
and business schemas stay in the TypeScript CLI/contracts. Generate JSON policy
with `bun run --cwd apps/desktop native:generate`; do not hand-edit its outputs.

Preserve profile/data paths and the exclusive desktop-instance.sqlite lifetime
lock. New tauri-sessions.sqlite and system credentials never read or delete
previous-host credentials. API cookies, instance keys and host credentials never
reach renderer storage, TOML or diagnostics. Session loss cannot reset or transfer
enrollment.

Invoke commands require the main window and its configured trusted origin. Deny
external navigation/popups. HTTP enforces origin, path/header policy, limits,
timeouts, cancellation and no redirects. Event delivery is bounded, ordered and
acknowledged by subscription generation. Native picker owns directory grants.
GUI Quit releases UI leases and disconnects its daemon proxy, preserving tasks.

Tests use synthetic data, real subprocesses and SQLite locks. Native-smoke controls
exist only behind the Cargo feature, authenticated private IPC, a separate app ID
and a marked temporary data directory. Production byte inspection rejects them.
Run `tauri:check`, `tauri:test` and root `bun run verify`. Linux core compilation
or tests do not establish Linux GUI acceptance. macOS/Windows GUI, installer and
signing checks require their actual platforms and must be reported accurately.
