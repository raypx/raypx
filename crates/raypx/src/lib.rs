//! The Rust entry point for Raypx.
//!
//! This initial release exposes the shared error types from [`raypx_core`].
//! Further Rust functionality will follow as concrete consumers are established.
//!
//! ```
//! use raypx::{Error, Result};
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

pub use raypx_core::{Error, Result};
