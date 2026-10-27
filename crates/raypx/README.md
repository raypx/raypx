# raypx

The Rust entry point for [Raypx](https://github.com/raypx/raypx).

This initial `0.0.0-alpha.0` release establishes the crate and re-exports `Error`
and `Result<T>` from `raypx-core`. Further Rust functionality will follow as
concrete consumers are established. This crate currently provides a library API;
the Raypx CLI and Desktop application are developed separately in the repository.

```rust
use raypx::{Error, Result};

fn require_name(name: &str) -> Result<&str> {
    if name.trim().is_empty() {
        return Err(Error::invalid_input("name must not be empty"));
    }
    Ok(name)
}
```

Licensed under Apache-2.0.
