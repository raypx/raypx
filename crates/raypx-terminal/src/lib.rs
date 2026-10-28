//! GUI-independent terminal ownership for the Raypx CLI.
//!
//! A host owns PTYs; an attachment only observes one. Session metadata and
//! bounded replay stay separate from the actor, child and OS handles. This
//! architecture was informed by herdr; this implementation shares no source.

mod pty_io;
mod session;

use serde::Serialize;
use std::{collections::HashMap, fmt, path::PathBuf, sync::Mutex};

use session::Session;
pub use session::{Attachment, OutputChunk, SessionEvent};

pub const PROTOCOL_VERSION: u32 = 1;
pub const MAX_INPUT_BYTES: usize = 64 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Error(pub &'static str);
impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(self.0)
    }
}
impl std::error::Error for Error {}
pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Clone)]
pub struct Command {
    pub executable: PathBuf,
    pub args: Vec<String>,
    pub cwd: PathBuf,
}

#[derive(Debug, Clone, Copy)]
pub struct Limits {
    pub sessions: usize,
    pub history_bytes: usize,
    pub subscriber_events: usize,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            sessions: 16,
            history_bytes: 1024 * 1024,
            subscriber_events: 64,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Status {
    Running,
    Exited,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub id: String,
    pub pid: Option<u32>,
    pub cols: u16,
    pub rows: u16,
    pub status: Status,
    pub exit_code: Option<u32>,
    pub sequence: u64,
    pub history_truncated: bool,
}

#[derive(Default)]
struct Registry {
    closed: bool,
    sessions: HashMap<String, Session>,
}

pub struct TerminalHost {
    limits: Limits,
    registry: Mutex<Registry>,
}
impl Default for TerminalHost {
    fn default() -> Self {
        Self::new(Limits::default()).expect("default terminal limits are valid")
    }
}
impl TerminalHost {
    pub fn new(limits: Limits) -> Result<Self> {
        if !(1..=64).contains(&limits.sessions)
            || !(1024..=16 * 1024 * 1024).contains(&limits.history_bytes)
            || !(1..=256).contains(&limits.subscriber_events)
        {
            return Err(Error("INVALID_LIMITS"));
        }
        Ok(Self {
            limits,
            registry: Mutex::new(Registry::default()),
        })
    }

    pub fn open(&self, command: Command, cols: u16, rows: u16) -> Result<Snapshot> {
        validate_size(cols, rows)?;
        if !command.executable.is_absolute() || !command.cwd.is_absolute() {
            return Err(Error("ABSOLUTE_PATH_REQUIRED"));
        }
        if !command.executable.is_file() || !command.cwd.is_dir() {
            return Err(Error("INVALID_COMMAND"));
        }
        let mut registry = self
            .registry
            .lock()
            .map_err(|_| Error("HOST_UNAVAILABLE"))?;
        if registry.closed {
            return Err(Error("HOST_CLOSED"));
        }
        // Completed sessions retain replay until capacity is needed. Live
        // sessions are never evicted to make room for another process.
        if registry.sessions.len() >= self.limits.sessions {
            registry
                .sessions
                .retain(|_, session| session.snapshot().status == Status::Running);
        }
        if registry.sessions.len() >= self.limits.sessions {
            return Err(Error("SESSION_LIMIT"));
        }
        let session = Session::spawn(command, cols, rows, self.limits)?;
        let snapshot = session.snapshot();
        registry.sessions.insert(snapshot.id.clone(), session);
        Ok(snapshot)
    }

    fn session(&self, id: &str) -> Result<Session> {
        self.registry
            .lock()
            .map_err(|_| Error("HOST_UNAVAILABLE"))?
            .sessions
            .get(id)
            .cloned()
            .ok_or(Error("TERMINAL_NOT_FOUND"))
    }
    pub fn snapshot(&self, id: &str) -> Result<Snapshot> {
        Ok(self.session(id)?.snapshot())
    }
    pub fn list(&self) -> Result<Vec<Snapshot>> {
        Ok(self
            .registry
            .lock()
            .map_err(|_| Error("HOST_UNAVAILABLE"))?
            .sessions
            .values()
            .map(Session::snapshot)
            .collect())
    }
    pub fn attach(&self, id: &str) -> Result<Attachment> {
        self.session(id)?.attach()
    }
    pub fn detach(&self, id: &str, attachment: u64) -> Result<()> {
        self.session(id)?.detach(attachment);
        Ok(())
    }
    pub fn write(&self, id: &str, bytes: Vec<u8>) -> Result<()> {
        if bytes.len() > MAX_INPUT_BYTES {
            return Err(Error("TOO_LARGE"));
        }
        self.session(id)?.write(bytes)
    }
    pub fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<()> {
        validate_size(cols, rows)?;
        self.session(id)?.resize(cols, rows)
    }
    pub fn close(&self, id: &str) -> Result<()> {
        self.session(id)?.stop()
    }
    pub fn shutdown(&self) {
        let sessions = {
            let mut registry = self.registry.lock().unwrap_or_else(|e| e.into_inner());
            registry.closed = true;
            std::mem::take(&mut registry.sessions)
        };
        // Signal every child before waiting for any one session to drain.
        for session in sessions.values() {
            session.cancel();
        }
        for session in sessions.values() {
            let _ = session.wait_closed();
        }
    }
}
impl Drop for TerminalHost {
    fn drop(&mut self) {
        self.shutdown();
    }
}

fn validate_size(cols: u16, rows: u16) -> Result<()> {
    if !(2..=500).contains(&cols) || !(2..=300).contains(&rows) {
        return Err(Error("INVALID_SIZE"));
    }
    Ok(())
}
