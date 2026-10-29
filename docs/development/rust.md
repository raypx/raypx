# Rust workspace

Rust libraries live under `crates/*`, discovered by the root `Cargo.toml`.
The Tauri application crate is `apps/desktop/src-tauri` (`raypx-desktop`); it owns
transport and native policy, with no task execution or duplicated business schemas. The
initial [raypx-core](../../crates/raypx-core/README.md) library provides `Error`
and `Result<T>`, integration tests, a compiled documentation example and a runnable
`basic` example. It has no external dependencies or application runtime.
The [raypx](../../crates/raypx/README.md) crate is the public Rust entry point,
initially re-exporting the core error types. These two libraries opt in to
crates.io publication; the workspace default keeps other crates private.

The structure follows the library-under-crates approach in
[rovai-core](https://github.com/murray17/rovai-ai/tree/main/crates/rovai-core).
The Rust crate is independent of TypeScript's `@raypx/core`; task schemas stay
in that existing package until a concrete Rust integration is designed.

## Toolchain

Install rustup, then run these commands from the repository root:

```sh
rustup show
bun run verify --full
cargo run -p raypx-core --locked --example basic
```

`rust-toolchain.toml` is the Rust version source, pinned to 1.99.1 with a minimal
profile plus rustfmt and Clippy. rustup installs the selected toolchain when a
Cargo command runs. Root `Cargo.toml` shares the package version, Rust edition,
minimum Rust version, license, repository, publication policy and lints. Keep its
`rust-version` aligned when upgrading the toolchain. New crates inherit those
settings. Unsafe code is forbidden by the workspace lint policy.

## Herdr terminal runtime

Interactive terminals use the prebuilt [Herdr](https://github.com/herdrdev/herdr)
runtime pinned in `apps/cli/package.json`. Herdr owns PTYs, terminal emulation and
cursor responses; Raypx owns tasks, authorization and session lifetime. The old
`raypx-terminal` crate has been removed. Cargo no longer compiles a terminal engine.

Desktop preparation downloads the matching release, verifies its SHA-256 and stages
the complete runtime and licenses. Windows includes the release's ConPTY DLLs.
The packaged CLI copies it into the device profile before launch so an updater can
replace the application bundle. Runtime requests never download executables.

For standalone CLI development:

```sh
bun run --cwd apps/cli prepare:herdr "$PWD/apps/cli/dist/herdr"
bun run build:cli
RAYPX_HERDR_BINARY="$PWD/apps/cli/dist/herdr/herdr" RAYPX_HERDR_COMPILED=1 bun run --cwd apps/cli smoke:herdr-terminal
```

`RAYPX_HERDR_BINARY` may select an absolute, version-matched executable for development.
Without an override, CLI uses its verified bundled/cache runtime, then a matching
installed Herdr. Desktop preparation also stages a development copy under
`apps/desktop/src-tauri/binaries/herdr`. An existing daemon keeps its original
environment; restart only after its owned work is finished.

Each owner creates a private headless server with isolated config, state and sockets.
Command arguments and the original child environment travel through a one-use local
handoff, not persisted layouts. Full and incremental ANSI frames feed the embedded
terminal; paste and scroll use Herdr's application modes and scrollback. A private
wrapper retains the final screen until Raypx captures it and reports the actual exit
code. Client disconnect cancels its terminals; owner EOF stops the private server.
Existing user Herdr sessions are never reused. This is not durable session recovery.

Default Bun verification uses protocol/distribution tests without a native runtime.
The explicit headless smoke gate checks real input, resize, cursor queries, paste,
final frames and cancellation; Desktop CI runs it with compiled CLI helpers on macOS
and Windows. Packaged WebView acceptance remains a separate isolated-CI gate.

Rust is managed by rustup; mise continues reading the existing Bun pin.
`bun run doctor` checks Bun and reports the Rust/WebView platform prerequisites; `rustup show` reports the Rust toolchain.

## Commands and verification

| Command                             | Runs                                                                      |
| ----------------------------------- | ------------------------------------------------------------------------- |
| `bun run verify`                    | Affected JS/Rust checks and tests                                         |
| `bun run verify --full`             | Full current-platform sources, builds and artifact probes                 |
| `bun run rust:clean`                | Clean workspace development artifacts, retaining dependencies and Release |
| `cargo fmt --all`                   | Apply Rust formatting                                                     |
| `cargo test -p raypx-core --locked` | Test one library directly                                                 |

Rust is required to develop/package the Tauri Desktop host and remains optional
for JS-only incremental feedback. `verify` selects Rust packages through the
workspace's reverse dependency graph. One uncached VP pipeline orders rustfmt,
Clippy for all targets/features and tests; Clippy and tests cover compilation without
separate redundant check/build steps. Independent JavaScript tasks can run in parallel.
Root `check`, `test`, `build`, `lint` and `format` remain independent of Cargo.
The reusable `rust.yml` workflow checks libraries on Ubuntu when the CI planner
selects Rust; Desktop fmt/Clippy/tests and packaging run on macOS and Windows.

VP owns repository task scheduling. Cargo tasks are uncached in VP; Cargo owns
its own incremental state in root `target/`. This avoids tracing compiler and
toolchain state through VP. For routine Rust cleanup, use:

```sh
bun run rust:clean
```

This delegates to `cargo clean --workspace --profile dev --locked --offline`, removing
workspace development/test artifacts while retaining dependency caches and Release
artifacts. `bun run clean` includes the same Rust step alongside application cleanup;
`clean:artifacts` preserves all Rust build outputs. Rust cleanup is skipped without a
Cargo manifest or target directory and respects `CARGO_TARGET_DIR`. A full `target/`
reset requires an explicit request. The root `Cargo.lock` is committed and
verification/build commands use `--locked`.

For repeated local verification, keep `target/` and use `clean:artifacts` when only
reports need clearing. Workspace development and test builds use `debug = 1`, retaining
backtrace locations without full type/variable debug data. Third-party dependencies
use `debug = 0` through `[profile.dev.package."*"]`, inherited by the test profile.
This reduces newly compiled dependency artifacts; existing cached variants remain
until explicitly cleaned. Cargo's default local incremental compilation and
CPU-based parallelism remain enabled; avoid routine
`CARGO_INCREMENTAL=0` or a fixed `CARGO_BUILD_JOBS=2` unless memory pressure requires
it. To inspect workspace variables in a debugger, temporarily set `CARGO_PROFILE_DEV_DEBUG=2`
and `CARGO_PROFILE_TEST_DEBUG=2`. Debugging a dependency requires a temporary named
package override with `debug = 2`. Changing profiles or compiler flags can require a
rebuild. Release packaging has separate optimized outputs and remains an explicit
gate; a warm development build cannot replace it.

Crates are Cargo members, not Bun workspaces, and need no `package.json`. Add
Rust dependencies in Cargo manifests. Introduce shared `[workspace.dependencies]`
when dependencies are actually needed; the initial library uses only `std`.
Keep crate-owned tests in `tests/` and runnable usage in `examples/`.

## Library publication

The initial `raypx-core` and `raypx` releases use `0.0.0-alpha.0`. Their library
release versions are declared in each crate, independently of the Desktop
application's workspace version.
`raypx` declares both a local path and a registry version for `raypx-core`, so
local development uses the workspace and published consumers use crates.io.
Publish `raypx-core` first, then verify and publish `raypx`:

```sh
cargo publish -p raypx-core --registry crates-io --locked --dry-run
cargo publish -p raypx-core --registry crates-io --locked
cargo publish -p raypx --registry crates-io --locked --dry-run
cargo publish -p raypx --registry crates-io --locked
```

Inspect package contents with `cargo package -p <name> --list`. When publishing
from an intentionally uncommitted checkout, inspect the selected files first
and add `--allow-dirty` to Cargo's package/publish commands.

## Desktop crate

On macOS and Windows, verification that includes Desktop prepares the matching
CLI and generated TS vocabulary/translated notifications through VP before Cargo.
Shared preparation runs once without building the renderer. Formatting and
library-only checks need no sidecar. Staging identical CLI bytes preserves the
sidecar's modification time so another package build can reuse Cargo outputs.

Direct Cargo commands bypass VP. Prepare the inputs first when using them:

```sh
bun run build:cli
bun run --cwd apps/desktop tauri:generate
bun run --cwd apps/desktop tauri:cli
cargo check -p raypx-desktop --locked --all-features
cargo test -p raypx-desktop --locked --all-features
bun run package:desktop
```

Cargo tests retain the migration JSON policy fixtures and check the generated TS
command vocabulary. Preference preload tests also execute the actual JS and TS
validator through Bun. The `native-smoke` Cargo
feature adds a token-authenticated private socket for release WebView acceptance;
normal builds cannot evaluate renderer scripts through a debug interface.
See [ADR 0036](../architecture/0036-tauri-desktop-host.md) for migration gates.
