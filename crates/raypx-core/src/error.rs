use std::{fmt, io};

/// The result type used by Raypx Rust library operations.
pub type Result<T> = std::result::Result<T, Error>;

/// Errors shared by the initial Rust library.
#[derive(Debug)]
#[non_exhaustive]
pub enum Error {
    /// Input rejected before an operation starts.
    InvalidInput(String),
    /// An I/O failure, retaining the underlying error.
    Io(io::Error),
}

impl Error {
    /// Creates an input error with a descriptive message.
    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::InvalidInput(message.into())
    }
}

impl fmt::Display for Error {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidInput(message) => formatter.write_str(message),
            Self::Io(error) => error.fmt(formatter),
        }
    }
}

impl std::error::Error for Error {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            Self::InvalidInput(_) => None,
            Self::Io(error) => Some(error),
        }
    }
}

impl From<io::Error> for Error {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}
