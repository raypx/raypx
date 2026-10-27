# Rust crates

## Purpose

The root Cargo workspace owns Rust libraries under `crates/*`. `raypx-core` is
the initial library experiment, with a small shared error surface and no runtime host.

## Boundaries

- Cargo.toml owns Rust workspace membership and shared package/lint settings.
  Inherit those settings in each crate; keep one committed root Cargo.lock.
- rust-toolchain.toml pins Rust and enables rustfmt and Clippy. Do not add
  Rust versions to mise.toml or package.json.
- Crates are not Bun workspaces. Use Cargo dependencies for Rust libraries.
- Keep public APIs small and tests in each crate's `tests/` directory.
- Do not duplicate the task-domain schemas in `packages/core` or introduce
  application, database, network, FFI or JavaScript bindings without a real consumer.
- Cargo owns incremental compilation under root `target/`. VP runs Cargo tasks
  uncached so its filesystem tracer does not attempt to cache Rust toolchain state.

## Verification

Run `bun run rust:verify` for formatting, Clippy, checks, tests and builds.
`bun run check`, `test`, `build` and `verify` include their Rust gates.
Use direct Cargo commands to select one crate or run an example.
