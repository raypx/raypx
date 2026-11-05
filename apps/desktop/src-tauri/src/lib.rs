pub mod api;
pub mod config;
pub mod engine;
pub mod events;
pub mod host;
#[cfg(windows)]
mod permissions;
pub mod sessions;
#[cfg(feature = "gui")]
pub mod shell;
#[cfg(all(feature = "gui", feature = "native-smoke"))]
pub mod smoke;
pub type Result<T> = std::result::Result<T, Error>;
pub const LINE_LIMIT: usize = 8 * 1024 * 1024;
#[derive(Debug, thiserror::Error)]
#[error("{0}")]
pub struct Error(pub String);
impl From<&str> for Error {
    fn from(value: &str) -> Self {
        Self(value.into())
    }
}
macro_rules! sanitized { ($($t:ty),*) => { $(impl From<$t> for Error { fn from(_: $t) -> Self { Self("NATIVE_OPERATION_FAILED".into()) } })* }; }
sanitized!(
    std::io::Error,
    serde_json::Error,
    rusqlite::Error,
    url::ParseError,
    toml::de::Error,
    reqwest::Error
);
pub fn fail<T>(message: &str) -> Result<T> {
    Err(Error(message.into()))
}
