# Rust crates

## Purpose

The root Cargo workspace owns Rust libraries under `crates/*`. `raypx-core` is
the initial library experiment, with a small shared error surface and no runtime host.
`raypx` is the public entry point and re-exports the core error types. Both are
published to crates.io; publish `raypx-core` first. Other crates remain private
unless explicitly opted in through their package manifests.
`apps/desktop/src-tauri` is the Tauri application composition root, never a dependency
of another crate. It owns native transport and policy; CLI owns execution and TS owns
business schemas. Its platform verification runs in the Desktop CI matrix.

Terminal PTYs and VT state use the external pinned Herdr runtime. CLI owns its
adapter and lifecycle; no in-repository Rust terminal host is maintained.

## Boundaries

- Cargo.toml owns Rust workspace membership and shared package/lint settings.
  Inherit those settings in each crate; publishable libraries declare their
  release versions independently of Desktop. Keep one committed root Cargo.lock.
- rust-toolchain.toml pins Rust and enables rustfmt and Clippy. Do not add
  Rust versions to mise.toml or package.json.
- Crates are not Bun workspaces. Use Cargo dependencies for Rust libraries.
- Keep public APIs small and tests in each crate's `tests/` directory.
- Do not duplicate the task-domain schemas in `packages/core` or introduce
  application, database, network, FFI or JavaScript bindings without a real consumer.
- Cargo owns incremental compilation under root `target/`. VP runs Cargo tasks
  uncached so its filesystem tracer does not attempt to cache Rust toolchain state.

## Verification

Run `bun run verify` for affected checks or `bun run verify --full` for complete
current-platform verification, including rustfmt, Clippy and tests.
Linux Rust tasks exclude the Desktop
crate to avoid requiring WebKit/GTK development libraries; Desktop CI checks it on
macOS and Windows after staging the CLI sidecar.
Use direct Cargo commands to select one crate or run an example.
