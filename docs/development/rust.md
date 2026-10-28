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
bun run rust:verify
cargo run -p raypx-core --locked --example basic
```

`rust-toolchain.toml` is the Rust version source, pinned to 1.97.1 with a minimal
profile plus rustfmt and Clippy. rustup installs the selected toolchain when a
Cargo command runs. Root `Cargo.toml` shares the package version, Rust edition,
minimum Rust version, license, repository, publication policy and lints. Keep its
`rust-version` aligned when upgrading the toolchain. New crates inherit those
settings. Unsafe code is forbidden by the workspace lint policy.

## Optional Rust terminal host

The private `crates/raypx-terminal` library and `raypx-terminal-host` executable
provide GUI-independent PTY ownership. CLI's existing terminal methods can use it
without moving Agent approvals or task persistence into Rust:

```sh
cargo build -p raypx-terminal --locked
export RAYPX_TERMINAL_HOST="$PWD/target/debug/raypx-terminal-host"
bun run dev:desktop
```

On Windows use the absolute `.exe` path. The setting is captured by the CLI owner
at startup; an already-running daemon retains its previous backend. Restart it
only after its owned work is finished. An explicitly configured companion must
match the application and protocol versions. Default Bun commands still need no
Rust, and Desktop distribution does not yet bundle this optional executable.

The Rust host separates snapshots/replay from live PTYs, serializes input/resize,
and keeps PTY readers independent of slow attachments. Detach preserves the
process and a new attachment gets an atomic replay baseline. The current CLI
adapter preserves client-owned terminal cancellation; managed Agent execution
still belongs to the independent CLI daemon. Host restart is not crash recovery.
See [the terminal host](../../crates/raypx-terminal/README.md).

Rust is managed by rustup; mise continues reading the existing Bun pin.
`bun run doctor` checks Bun and reports the Rust/WebView platform prerequisites; `rustup show` reports the Rust toolchain.

## Commands and verification

| Command                             | Runs                                                          |
| ----------------------------------- | ------------------------------------------------------------- |
| `bun run rust:check`                | Cargo check for workspace targets (Desktop excluded on Linux) |
| `bun run rust:test`                 | Cargo tests (Desktop excluded on Linux)                       |
| `bun run rust:build`                | Cargo build for workspace targets (Desktop excluded on Linux) |
| `bun run rust:lint`                 | Clippy for all targets, denying warnings                      |
| `bun run rust:format`               | rustfmt check                                                 |
| `bun run rust:verify`               | All five Rust gates through VP                                |
| `cargo fmt --all`                   | Apply Rust formatting                                         |
| `cargo test -p raypx-core --locked` | Test only the initial library                                 |

Rust is required to develop/package the Tauri Desktop host, and remains optional
for renderer, API, Web and CLI work. Root `check`, `test`, `build`, `lint`, `format`, `verify:quick`
and `verify` do not invoke Cargo or rustup. The independent `rust.yml` workflow
runs for Rust/toolchain/task-model changes (or manual dispatch), excluding Desktop
on Ubuntu. The Desktop CI matrix runs its fmt/Clippy/tests on macOS and Windows. Explicit
`bun run rust:verify` schedules all five gates serially to avoid competing for
Cargo's shared `target/` lock. Filtered Bun commands retain their selected scope.

VP owns repository task scheduling. Cargo tasks are uncached in VP; Cargo owns
its own incremental state in root `target/`. This avoids tracing compiler and
toolchain state through VP. `bun run clean` removes `target/`, while
`clean:artifacts` preserves Rust build outputs. The root `Cargo.lock` is committed
and verification/build commands use `--locked`.

For repeated local verification, keep `target/` and use `clean:artifacts` when only
reports need clearing. The development and test profiles use `debug = 1`, retaining
backtrace locations without full type/variable debug data. Cargo's default local
incremental compilation and CPU-based parallelism remain enabled; avoid routine
`CARGO_INCREMENTAL=0` or a fixed `CARGO_BUILD_JOBS=2` unless memory pressure requires
it. To inspect variables in a debugger, temporarily set `CARGO_PROFILE_DEV_DEBUG=2`
and `CARGO_PROFILE_TEST_DEBUG=2`. Changing profiles or compiler flags can require a
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

On macOS and Windows, root `rust:check`, `rust:lint`, `rust:test` and `rust:build`
automatically build the matching CLI through VP and stage it together with generated
TS vocabulary and translated notifications before invoking Cargo. Shared preparation
runs once in `rust:verify`, without building the renderer. Formatting and Linux
library verification need no sidecar. Staging identical CLI bytes preserves the
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
