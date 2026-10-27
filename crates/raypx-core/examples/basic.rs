use std::io::{self, Write};

use raypx_core::{Error, Result};

fn greeting(name: &str) -> Result<String> {
    if name.trim().is_empty() {
        return Err(Error::invalid_input("name must not be empty"));
    }
    Ok(format!("Hello from {name}'s Rust core!"))
}

fn main() -> Result<()> {
    writeln!(io::stdout().lock(), "{}", greeting("Raypx")?)?;
    Ok(())
}
