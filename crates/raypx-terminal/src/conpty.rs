use std::{
    collections::VecDeque,
    io::Read,
    sync::mpsc::{self, Receiver, SyncSender},
};

const CURSOR_QUERY: &[u8] = b"\x1b[6n";
#[cfg(windows)]
pub(crate) const CURSOR_ORIGIN: &[u8] = b"\x1b[1;1R";

pub(crate) fn reader(inner: Box<dyn Read + Send>) -> (Box<dyn Read + Send>, Receiver<()>) {
    let (ready, startup) = mpsc::sync_channel(1);
    (
        Box::new(Reader {
            inner,
            query: CursorQuery::default(),
            ready: Some(ready),
            output: VecDeque::new(),
        }),
        startup,
    )
}

#[derive(Default)]
struct CursorQuery {
    prefix: Vec<u8>,
    complete: bool,
}
impl CursorQuery {
    fn consume(&mut self, bytes: &[u8]) -> Vec<u8> {
        let mut output = Vec::new();
        for &byte in bytes {
            if self.complete {
                output.push(byte);
                continue;
            }
            self.prefix.push(byte);
            while !CURSOR_QUERY.starts_with(&self.prefix) {
                output.push(self.prefix.remove(0));
            }
            if self.prefix == CURSOR_QUERY {
                self.prefix.clear();
                self.complete = true;
            }
        }
        output
    }
}

struct Reader {
    inner: Box<dyn Read + Send>,
    query: CursorQuery,
    ready: Option<SyncSender<()>>,
    output: VecDeque<u8>,
}
impl Read for Reader {
    fn read(&mut self, bytes: &mut [u8]) -> std::io::Result<usize> {
        if bytes.is_empty() {
            return Ok(0);
        }
        while self.output.is_empty() {
            if self.query.complete {
                return self.inner.read(bytes);
            }
            let mut buffer = [0u8; 8192];
            let count = self.inner.read(&mut buffer)?;
            self.output.extend(self.query.consume(&buffer[..count]));
            if self.query.complete {
                // portable-pty enables INHERIT_CURSOR. The input actor replies
                // before user input; clients must not replay this startup query
                // or send a second cursor report into the running application.
                if let Some(ready) = self.ready.take() {
                    let _ = ready.send(());
                }
            }
            if count == 0 {
                self.output.extend(self.query.prefix.drain(..));
                self.ready.take();
                break;
            }
        }
        let count = bytes.len().min(self.output.len());
        for byte in &mut bytes[..count] {
            *byte = self.output.pop_front().expect("buffered output");
        }
        Ok(count)
    }
}

#[cfg(test)]
#[path = "../tests/unit/conpty.rs"]
mod tests;
