use crate::{Error, Result};
use portable_pty::MasterPty;
use std::io::{Read, Write};

pub(crate) struct Streams {
    pub reader: Box<dyn Read + Send>,
    pub writer: Box<dyn Write + Send>,
}

#[cfg(windows)]
pub(crate) fn open(master: &dyn MasterPty) -> Result<Streams> {
    Ok(Streams {
        reader: master
            .try_clone_reader()
            .map_err(|_| Error("PTY_OPEN_FAILED"))?,
        writer: master.take_writer().map_err(|_| Error("PTY_OPEN_FAILED"))?,
    })
}

#[cfg(unix)]
pub(crate) fn open(master: &dyn MasterPty) -> Result<Streams> {
    use filedescriptor::FileDescriptor;
    use std::os::fd::{AsRawFd, RawFd};

    // The master stays borrowed until duplication completes; no raw descriptor
    // ownership is transferred. All duplicates share the nonblocking flag.
    struct BorrowedMaster<'a>(&'a dyn MasterPty);
    impl AsRawFd for BorrowedMaster<'_> {
        fn as_raw_fd(&self) -> RawFd {
            self.0.as_raw_fd().expect("native Unix PTY descriptor")
        }
    }
    if master.as_raw_fd().is_none() {
        return Err(Error("PTY_OPEN_FAILED"));
    }
    let mut writer =
        FileDescriptor::dup(&BorrowedMaster(master)).map_err(|_| Error("PTY_OPEN_FAILED"))?;
    writer
        .set_non_blocking(true)
        .map_err(|_| Error("PTY_OPEN_FAILED"))?;
    let reader = writer.try_clone().map_err(|_| Error("PTY_OPEN_FAILED"))?;
    Ok(Streams {
        reader: Box::new(Reader(reader)),
        // A plain descriptor also avoids portable-pty's blocking EOF write on
        // writer drop. Session shutdown kills and drains the child explicitly.
        writer: Box::new(writer),
    })
}

#[cfg(unix)]
struct Reader(filedescriptor::FileDescriptor);

#[cfg(unix)]
impl Read for Reader {
    fn read(&mut self, bytes: &mut [u8]) -> std::io::Result<usize> {
        use filedescriptor::{AsRawFileDescriptor, POLLIN, poll, pollfd};
        loop {
            match self.0.read(bytes) {
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    // Keep output event-driven even though the shared master
                    // descriptor must be nonblocking for cancellable input.
                    poll(
                        &mut [pollfd {
                            fd: self.0.as_raw_file_descriptor(),
                            events: POLLIN,
                            revents: 0,
                        }],
                        None,
                    )
                    .map_err(|error| match error {
                        filedescriptor::Error::Poll(error) => error,
                        error => std::io::Error::other(error),
                    })?;
                }
                result => return result,
            }
        }
    }
}
