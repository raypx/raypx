use std::{error::Error as _, io};

use raypx_core::{Error, Result};

#[test]
fn invalid_input_retains_owned_message_without_a_source() {
    let error = Error::invalid_input(String::from("name must not be empty"));

    assert!(matches!(error, Error::InvalidInput(_)));
    assert_eq!(error.to_string(), "name must not be empty");
    assert!(error.source().is_none());
}

#[test]
fn question_mark_preserves_the_original_io_error() {
    fn operation() -> Result<()> {
        Err(io::Error::new(
            io::ErrorKind::PermissionDenied,
            "access denied",
        ))?;
        Ok(())
    }

    let error = operation().expect_err("the I/O error should propagate");
    let source = error
        .source()
        .and_then(|source| source.downcast_ref::<io::Error>())
        .expect("the original I/O error should remain available");

    assert!(matches!(error, Error::Io(_)));
    assert_eq!(source.kind(), io::ErrorKind::PermissionDenied);
    assert_eq!(error.to_string(), "access denied");
}
