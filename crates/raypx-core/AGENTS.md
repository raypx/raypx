# raypx-core

## Purpose and interface

Initial dependency-free Rust library. The public `error` module and root re-exports
provide `Error` and `Result<T>`. Invalid input retains a caller-supplied message;
I/O errors retain their original source and support `?` through `From`.

This library is independent of the TypeScript `@raypx/core` domain package.
Grow it only when concrete Rust consumers establish the next responsibility.

## Verification

Run `cargo test -p raypx-core --locked` and
`cargo run -p raypx-core --locked --example basic`.
Integration tests belong in `tests/`; runnable usage belongs in `examples/`.

## Publication

Publish this crate to crates.io before `raypx`, which depends on its published
library release version. Package source, tests, examples, the README and license
only.
