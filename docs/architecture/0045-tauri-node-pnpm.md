# ADR 0045: Tauri, Node and pnpm

Status: superseded on 2026-11-06 by [ADR 0046](0046-mygo-bun-artifacts.md). Historical decision accepted 2026-11-05. Supersedes the former Desktop implementation
and the repository's Bun-only toolchain rule.

Raypx uses TypeScript for product and execution code and Rust for the Tauri
desktop host and a small CLI launcher. Node runs all local JavaScript
and server services; pnpm 12.16.1 owns dependency installation and its lockfile.
Tauri 2.12.5 and Rust 1.99.1 replace the Go host. VP remains the only task graph.
macOS requires 13.5 or newer, matching the official bundled Node distribution.

Runtime range amendment (2026-11-06): root `engines.node` and `devEngines.runtime`
require `>=24.18.0 <25`. Development, doctor, CI and packaging accept any stable
release in that range. Desktop runtime staging bundles the actual build runtime and records
its exact version in runtime.json; deployment image versions must satisfy the range.

The Rust Tauri framework is pinned to 2.12.5. The published JavaScript CLI and
API packages are pinned to 2.12.4 because 2.12.5 is not available for those npm
packages; the framework and JavaScript packages have independent releases.

Distribution amendment (2026-11-06): the normal CLI build produces an installable
JS package with a `raypx` bin, ESM application, verified platform Herdr assets and
an integrity inventory. It requires supported Node. npm, pnpm and compatible
installers all use the same build; there is no package-manager-specific build.
Desktop staging adds its native launcher and actual build Node runtime, retaining
only the host's Herdr assets. Desktop users need no global JavaScript runtime.
pnpm remains the repository package manager and is not bundled. Project commands
use the user's environment and retain PATH precedence. Windows daemon and connector
installation own a complete versioned payload; package installations record the
absolute Node interpreter. GUI Quit never stops the daemon.

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
