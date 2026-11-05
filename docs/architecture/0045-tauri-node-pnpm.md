# ADR 0045: Tauri, Node and pnpm

Status: accepted, 2026-11-05. Supersedes the former Desktop implementation
and the repository's Bun-only toolchain rule.

Raypx uses TypeScript for product and execution code and Rust for the Tauri
desktop host and a small CLI launcher. Node 24.22.2 runs all local JavaScript
and server services; pnpm 12.16.1 owns dependency installation and its lockfile.
Tauri 2.12.5 and Rust 1.99.1 replace the Go host. VP remains the only task graph.
macOS requires 13.5 or newer, matching the official bundled Node distribution.

The Rust Tauri framework is pinned to 2.12.5. The published JavaScript CLI and
API packages are pinned to 2.12.4 because 2.12.5 is not available for those npm
packages; the framework and JavaScript packages have independent releases.

The CLI ships as a versioned directory containing the native launcher, Node,
ESM application, pnpm and verified terminal resources. Users need no global
JavaScript runtime. User-installed executables retain PATH precedence. Windows
daemon and connector installation own a complete versioned payload rather than
copying one executable. GUI Quit never stops the daemon.

Current NDJSON, Relay v4, SQLite schemas and migration journals remain the
baseline. Profile paths, offline enrollment, preferences, grants and the SQLite
desktop instance lock are preserved. Tauri establishes a new native session
store and OS key; users sign in once. Credentials from the previous Desktop host
are not imported or deleted. Remote authorization is still separate from local
enrollment.

Native commands are restricted to the owned main WebView. Cookies and host
credentials remain native; directory grants require the native picker. Events
remain bounded and acknowledged. The first Tauri release uses a signed installer;
subsequent updates use a new Tauri signing key and feed. Native smoke builds have
separate identity, paths and explicitly compiled test controls. macOS/Windows
signing and GUI acceptance are release gates; Linux Desktop remains unverified.

The [current architecture](README.md) maps process and package ownership.
[CLI distribution](../../apps/cli/README.md#build-and-distribution),
[Desktop configuration/release](../development/desktop.md),
[local SQLite](../development/local-sqlite.md) and
[deployment](../development/deployment.md) define operational paths and commands.
The dated [migration validation record](../development/migration-validation.md)
records measured artifacts and unavailable platform checks; it is not a release approval.
