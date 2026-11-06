# ADR 0046: Bun and Tauri experiment

Status: experimental implementation for `dev`, developed on `feature/bun-tauri` from
986f58d5531c159f24da97ed532442bc0071ed82. Replaces ADR 0045's Node/pnpm and
CLI launcher choices; retains its Tauri native security boundaries.

Bun 1.4.4 owns workspace installation, catalogs, scripts, tests, Nitro services
and standalone CLI compilation. `package.json` is the workspace inventory and
runtime pin; `bun.lock` is the installation lockfile. VP owns the task graph/cache.
Rust 1.99.1 and Tauri 2.12.5 retain native UI, sessions, trusted renderer IPC,
HTTP policy and absolute-path CLI transport. Tauri's npm API/CLI packages are 2.12.4.

One compiled CLI payload includes Bun and the verified Herdr resources. Desktop
copies and verifies that payload without rebuilding, importing CLI source or
adding a separate runtime/launcher. Distribution signs and seals the payload
before sharing it. Consumers use `RAYPX_CLI_PAYLOAD`; checksums reject changes.
The independent CLI daemon keeps its task lifetime across GUI Quit. Enrollment,
local preferences, file grants and account/origin isolation keep their contracts.
CLI SQLite uses Drizzle's Bun SQLite adapter and supports only current schemas.

macOS 13.5+ and Windows WebView2 are configured targets. Linux core tests and
builds are useful evidence, but macOS/Windows GUI, installer, updater and signing
acceptance require their real platforms. This experiment does not establish a
release approval. See the [experiment record](../development/bun-tauri-experiment.md).
