# raypx-core

The first Rust library in Raypx's Cargo workspace. It currently provides `Error`
and `Result<T>` using only the standard library, including I/O error propagation
with the original source preserved.

This initial `0.0.0-alpha.0` crates.io release establishes the foundational
library. Further Rust functionality will follow as concrete consumers are
established.

```rust
use raypx_core::{Error, Result};

fn require_name(name: &str) -> Result<&str> {
    if name.trim().is_empty() {
        return Err(Error::invalid_input("name must not be empty"));
    }
    Ok(name)
}
```

From the repository root:

```sh
bun run verify --full
cargo run -p raypx-core --locked --example basic
cargo doc -p raypx-core --no-deps --open
```

This is an independent Rust starting point. Existing TypeScript task schemas and
CLI/Desktop behavior remain at their current owners. Add concrete Rust modules
and consumers before choosing a JavaScript/native transport or binding.

See the [Rust workspace guide](https://github.com/raypx/raypx/blob/main/docs/development/rust.md).

Licensed under Apache-2.0.
