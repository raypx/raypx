# raypx

## Purpose and interface

Public Rust entry point for Raypx. The initial crates.io release re-exports
`Error` and `Result<T>` from `raypx-core`; it has no application runtime or CLI.
Grow the API only when concrete Rust consumers establish a responsibility.

## Verification and publication

Run `cargo test -p raypx --locked`. Documentation examples exercise the public
re-exports. Publish `raypx-core` before `raypx`; keep both library release
versions and the dependency requirement aligned, independently of Desktop.
Include only source, the README and license in the published package.
