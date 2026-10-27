# Rust workspace

Rust libraries live under `crates/*`, discovered by the root `Cargo.toml`. The
initial [raypx-core](../../crates/raypx-core/README.md) library provides `Error`
and `Result<T>`, integration tests, a compiled documentation example and a runnable
`basic` example. It has no external dependencies or application runtime.

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

Rust is managed by rustup; mise continues reading only the existing Node/Bun pins.
`bun run doctor` checks Node and Bun; `rustup show` reports the Rust toolchain.

## Commands and verification

| Command                             | Runs                                       |
| ----------------------------------- | ------------------------------------------ |
| `bun run rust:check`                | Cargo check for all workspace targets      |
| `bun run rust:test`                 | Cargo tests, including documentation tests |
| `bun run rust:build`                | Cargo build for all workspace targets      |
| `bun run rust:lint`                 | Clippy for all targets, denying warnings   |
| `bun run rust:format`               | rustfmt check                              |
| `bun run rust:verify`               | All five Rust gates through VP             |
| `cargo fmt --all`                   | Apply Rust formatting                      |
| `cargo test -p raypx-core --locked` | Test only the initial library              |

Rust is optional. Root `check`, `test`, `build`, `lint`, `format`, `verify:quick`
and `verify` do not invoke Cargo or rustup. The independent `rust.yml` workflow
runs only for Rust/toolchain/task-model changes (or manual dispatch). Explicit
`bun run rust:verify` schedules all five gates serially to avoid competing for
Cargo's shared `target/` lock. Filtered Bun commands retain their selected scope.

VP owns repository task scheduling. Cargo tasks are uncached in VP; Cargo owns
its own incremental state in root `target/`. This avoids tracing compiler and
toolchain state through VP. `bun run clean` removes `target/`, while
`clean:artifacts` preserves Rust build outputs. The root `Cargo.lock` is committed
and verification/build commands use `--locked`.

Crates are Cargo members, not Bun workspaces, and need no `package.json`. Add
Rust dependencies in Cargo manifests. Introduce shared `[workspace.dependencies]`
when dependencies are actually needed; the initial library uses only `std`.
Keep crate-owned tests in `tests/` and runnable usage in `examples/`.
