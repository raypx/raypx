//! Foundational Rust primitives for Raypx.
//!
//! This initial library provides shared error handling without requiring an
//! application host or external dependencies.
//!
//! ```
//! use raypx_core::{Error, Result};
//!
//! fn require_name(name: &str) -> Result<&str> {
//!     if name.trim().is_empty() {
//!         return Err(Error::invalid_input("name must not be empty"));
//!     }
//!     Ok(name)
//! }
//!
//! assert_eq!(require_name("Raypx")?, "Raypx");
//! # Ok::<(), Error>(())
//! ```

pub mod error;

pub use error::{Error, Result};
