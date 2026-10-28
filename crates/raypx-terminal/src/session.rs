use crate::{Command, Error, Limits, Result, Snapshot, Status};
use portable_pty::{ChildKiller, CommandBuilder, MasterPty, PtySize, native_pty_system};
use std::{
    collections::VecDeque,
    io::{Read, Write},
    sync::{
        Arc, Condvar, Mutex,
        mpsc::{self, Receiver, SyncSender, TrySendError},
    },
    thread,
    time::{Duration, Instant},
};

const INPUT_QUEUE: usize = 32;
const IO_TIMEOUT: Duration = Duration::from_secs(2);

#[derive(Debug, Clone)]
pub struct OutputChunk {
    pub sequence: u64,
    pub data: Vec<u8>,
}
#[derive(Debug, Clone)]
pub enum SessionEvent {
    Output(OutputChunk),
    Exited { sequence: u64, exit_code: u32 },
}
pub struct Attachment {
    pub id: u64,
    pub snapshot: Snapshot,
    pub history: Vec<OutputChunk>,
    pub events: Receiver<SessionEvent>,
}

struct State {
    snapshot: Snapshot,
    history: VecDeque<OutputChunk>,
    retained: usize,
    history_limit: usize,
    subscription: Option<(u64, SyncSender<SessionEvent>)>,
    next_attachment: u64,
    reader_done: bool,
    child_exit: Option<u32>,
    closing: bool,
}
impl State {
    fn publish(&mut self, event: SessionEvent) {
        if self
            .subscription
            .as_ref()
            .is_some_and(|(_, tx)| tx.try_send(event).is_err())
        {
            // No PTY reader may block behind a slow or detached UI. Reattach
            // captures the retained suffix and authoritative status atomically.
            self.subscription = None;
        }
    }
    fn output(&mut self, data: &[u8]) {
        self.snapshot.sequence += 1;
        let chunk = OutputChunk {
            sequence: self.snapshot.sequence,
            data: data.to_vec(),
        };
        self.retained += chunk.data.len();
        self.history.push_back(chunk.clone());
        while self.retained > self.history_limit {
            let excess = self.retained - self.history_limit;
            let front = self
                .history
                .front_mut()
                .expect("retained bytes have a chunk");
            if front.data.len() <= excess {
                self.retained -= self.history.pop_front().expect("front exists").data.len();
            } else {
                front.data.drain(..excess);
                self.retained -= excess;
            }
            self.snapshot.history_truncated = true;
        }
        self.publish(SessionEvent::Output(chunk));
    }
    fn finish(&mut self) {
        if self.reader_done
            && let Some(exit_code) = self.child_exit
            && self.snapshot.status != Status::Exited
        {
            self.snapshot.status = Status::Exited;
            self.snapshot.exit_code = Some(exit_code);
            self.snapshot.sequence += 1;
            self.publish(SessionEvent::Exited {
                sequence: self.snapshot.sequence,
                exit_code,
            });
            self.subscription = None;
        }
    }
}
struct Shared {
    state: Mutex<State>,
    changed: Condvar,
}
impl Shared {
    fn update(&self, f: impl FnOnce(&mut State)) {
        let mut state = self.state.lock().unwrap_or_else(|e| e.into_inner());
        f(&mut state);
        state.finish();
        self.changed.notify_all();
    }
}
enum Input {
    Write(Vec<u8>, mpsc::Sender<Result<()>>),
    Resize(u16, u16, mpsc::Sender<Result<()>>),
    Exited,
}
struct Runtime {
    shared: Arc<Shared>,
    input: SyncSender<Input>,
    master: Master,
    killer: Mutex<Box<dyn ChildKiller + Send + Sync>>,
    workers: Mutex<Vec<thread::JoinHandle<()>>>,
    subscriber_events: usize,
}
#[derive(Clone)]
pub(crate) struct Session(Arc<Runtime>);
type Master = Arc<Mutex<Option<Box<dyn MasterPty + Send>>>>;
impl Session {
    pub(crate) fn spawn(command: Command, cols: u16, rows: u16, limits: Limits) -> Result<Self> {
        let pair = native_pty_system()
            .openpty(size(cols, rows))
            .map_err(|_| Error("PTY_OPEN_FAILED"))?;
        let mut builder = CommandBuilder::new(command.executable);
        builder.args(command.args);
        builder.cwd(command.cwd);
        builder.env("TERM", "xterm-256color");
        let mut child = pair
            .slave
            .spawn_command(builder)
            .map_err(|_| Error("PTY_SPAWN_FAILED"))?;
        drop(pair.slave);
        let pid = child.process_id();
        let killer = child.clone_killer();
        let crate::pty_io::Streams { reader, writer } = match crate::pty_io::open(&*pair.master) {
            Ok(streams) => streams,
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(error);
            }
        };
        let shared = Arc::new(Shared {
            state: Mutex::new(State {
                snapshot: Snapshot {
                    id: uuid::Uuid::new_v4().to_string(),
                    pid,
                    cols,
                    rows,
                    status: Status::Running,
                    exit_code: None,
                    sequence: 0,
                    history_truncated: false,
                },
                history: VecDeque::new(),
                retained: 0,
                history_limit: limits.history_bytes,
                subscription: None,
                next_attachment: 0,
                reader_done: false,
                child_exit: None,
                closing: false,
            }),
            changed: Condvar::new(),
        });
        let (tx, rx) = mpsc::sync_channel(INPUT_QUEUE);
        let master = Arc::new(Mutex::new(Some(pair.master)));
        let runtime = Arc::new(Runtime {
            shared: shared.clone(),
            input: tx.clone(),
            master: master.clone(),
            killer: Mutex::new(killer),
            workers: Mutex::new(Vec::new()),
            subscriber_events: limits.subscriber_events,
        });
        // Keep startup failures owned: cancel before dropping a partially
        // initialized session so a thread-limit failure cannot orphan a child.
        let session = Self(runtime);
        let actor_shared = shared.clone();
        let actor_master = master.clone();
        let actor = thread::Builder::new()
            .name("raypx-pty-input".into())
            .spawn(move || {
                run_input(actor_master, writer, rx, &actor_shared);
            });
        let Ok(actor) = actor else {
            session.cancel();
            let _ = child.wait();
            return Err(Error("PTY_THREAD_FAILED"));
        };
        session.0.workers.lock().unwrap().push(actor);
        let reader_shared = shared.clone();
        let output = thread::Builder::new()
            .name("raypx-pty-output".into())
            .spawn(move || {
                read_output(reader, &reader_shared);
            });
        let Ok(output) = output else {
            session.cancel();
            let _ = child.wait();
            let _ = tx.send(Input::Exited);
            return Err(Error("PTY_THREAD_FAILED"));
        };
        session.0.workers.lock().unwrap().push(output);
        let waiter = thread::Builder::new()
            .name("raypx-pty-wait".into())
            .spawn(move || {
                let exit = child.wait().map(|status| status.exit_code()).unwrap_or(1);
                terminate_foreground(&master);
                terminate_group(pid);
                shared.update(|state| state.child_exit = Some(exit));
                let _ = tx.send(Input::Exited);
            });
        let Ok(waiter) = waiter else {
            session.cancel();
            let _ = session.0.input.send(Input::Exited);
            reap_failed_startup(pid);
            return Err(Error("PTY_THREAD_FAILED"));
        };
        session.0.workers.lock().unwrap().push(waiter);
        Ok(session)
    }
    pub(crate) fn snapshot(&self) -> Snapshot {
        self.0
            .shared
            .state
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .snapshot
            .clone()
    }
    pub(crate) fn attach(&self) -> Result<Attachment> {
        let mut state = self
            .0
            .shared
            .state
            .lock()
            .map_err(|_| Error("HOST_UNAVAILABLE"))?;
        state.next_attachment += 1;
        let id = state.next_attachment;
        let (tx, events) = mpsc::sync_channel(self.0.subscriber_events);
        state.subscription = (state.snapshot.status == Status::Running).then_some((id, tx));
        Ok(Attachment {
            id,
            snapshot: state.snapshot.clone(),
            history: state.history.iter().cloned().collect(),
            events,
        })
    }
    pub(crate) fn detach(&self, attachment: u64) {
        let mut state = self
            .0
            .shared
            .state
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        if state
            .subscription
            .as_ref()
            .is_some_and(|(id, _)| *id == attachment)
        {
            state.subscription = None;
        }
    }
    fn send(&self, command: impl FnOnce(mpsc::Sender<Result<()>>) -> Input) -> Result<()> {
        if self.snapshot().status == Status::Exited {
            return Err(Error("TERMINAL_CLOSED"));
        }
        let (tx, rx) = mpsc::channel();
        self.0
            .input
            .try_send(command(tx))
            .map_err(|error| match error {
                TrySendError::Full(_) => Error("TERMINAL_BACKPRESSURE"),
                TrySendError::Disconnected(_) => Error("TERMINAL_CLOSED"),
            })?;
        rx.recv_timeout(IO_TIMEOUT).map_err(|error| match error {
            mpsc::RecvTimeoutError::Timeout => Error("TERMINAL_IO_TIMEOUT"),
            mpsc::RecvTimeoutError::Disconnected => Error("TERMINAL_CLOSED"),
        })?
    }
    pub(crate) fn write(&self, bytes: Vec<u8>) -> Result<()> {
        self.send(|reply| Input::Write(bytes, reply))
    }
    pub(crate) fn resize(&self, cols: u16, rows: u16) -> Result<()> {
        self.send(|reply| Input::Resize(cols, rows, reply))
    }
    pub(crate) fn cancel(&self) {
        self.0.shared.update(|state| state.closing = true);
        if self.snapshot().status == Status::Exited {
            return;
        }
        terminate_foreground(&self.0.master);
        terminate_group(self.snapshot().pid);
        let _ = self
            .0
            .killer
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .kill();
    }
    pub(crate) fn wait_closed(&self) -> Result<()> {
        let state = self
            .0
            .shared
            .state
            .lock()
            .map_err(|_| Error("HOST_UNAVAILABLE"))?;
        let (state, _) = self
            .0
            .shared
            .changed
            .wait_timeout_while(state, IO_TIMEOUT, |s| s.snapshot.status != Status::Exited)
            .map_err(|_| Error("HOST_UNAVAILABLE"))?;
        if state.snapshot.status != Status::Exited {
            return Err(Error("TERMINAL_DRAIN_TIMEOUT"));
        }
        drop(state);
        for worker in std::mem::take(&mut *self.0.workers.lock().unwrap_or_else(|e| e.into_inner()))
        {
            let _ = worker.join();
        }
        Ok(())
    }
    pub(crate) fn stop(&self) -> Result<()> {
        self.cancel();
        self.wait_closed()
    }
}

fn size(cols: u16, rows: u16) -> PtySize {
    PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    }
}
fn run_input(
    master: Master,
    mut writer: Box<dyn Write + Send>,
    rx: Receiver<Input>,
    shared: &Shared,
) {
    for input in rx {
        match input {
            Input::Write(bytes, reply) => {
                let _ = reply.send(write_input(&mut *writer, &bytes, shared));
            }
            Input::Resize(cols, rows, reply) => {
                let result = master
                    .lock()
                    .unwrap_or_else(|e| e.into_inner())
                    .as_ref()
                    .ok_or(Error("TERMINAL_CLOSED"))
                    .and_then(|pty| {
                        pty.resize(size(cols, rows))
                            .map_err(|_| Error("TERMINAL_IO"))
                    });
                if result.is_ok() {
                    shared.update(|state| {
                        state.snapshot.cols = cols;
                        state.snapshot.rows = rows;
                    });
                }
                let _ = reply.send(result);
            }
            Input::Exited => break,
        }
    }
    master.lock().unwrap_or_else(|e| e.into_inner()).take();
}
fn write_input(writer: &mut dyn Write, mut bytes: &[u8], shared: &Shared) -> Result<()> {
    let deadline = Instant::now() + IO_TIMEOUT;
    while !bytes.is_empty() {
        let state = shared.state.lock().unwrap_or_else(|e| e.into_inner());
        if state.closing || state.child_exit.is_some() {
            return Err(Error("TERMINAL_CLOSED"));
        }
        drop(state);
        let remaining = deadline.saturating_duration_since(Instant::now());
        if remaining.is_zero() {
            return Err(Error("TERMINAL_IO_TIMEOUT"));
        }
        match writer.write(bytes) {
            Ok(0) => return Err(Error("TERMINAL_IO")),
            Ok(count) => bytes = &bytes[count..],
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                let state = shared.state.lock().unwrap_or_else(|e| e.into_inner());
                // Cancellation wakes this wait immediately; a full PTY buffer
                // must never pin the actor or its shutdown join in write_all.
                let _ = shared
                    .changed
                    .wait_timeout_while(state, remaining.min(Duration::from_millis(10)), |state| {
                        !state.closing && state.child_exit.is_none()
                    })
                    .unwrap_or_else(|e| e.into_inner());
            }
            Err(_) => return Err(Error("TERMINAL_IO")),
        }
    }
    writer.flush().map_err(|_| Error("TERMINAL_IO"))
}
fn read_output(mut reader: Box<dyn Read + Send>, shared: &Shared) {
    let mut buffer = [0u8; 8192];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) => break,
            Ok(count) => shared.update(|state| state.output(&buffer[..count])),
            Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
            Err(_) => break,
        }
    }
    shared.update(|state| state.reader_done = true);
}
#[cfg(unix)]
fn terminate_group(pid: Option<u32>) {
    if let Some(pid) = pid
        .and_then(|pid| i32::try_from(pid).ok())
        .filter(|pid| *pid > 1)
    {
        let _ = nix::sys::signal::killpg(
            nix::unistd::Pid::from_raw(pid),
            nix::sys::signal::Signal::SIGKILL,
        );
    }
}
#[cfg(unix)]
fn terminate_foreground(master: &Master) {
    let group = master
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .as_ref()
        .and_then(|pty| pty.process_group_leader())
        .and_then(|pid| u32::try_from(pid).ok());
    terminate_group(group);
}
#[cfg(windows)]
fn terminate_foreground(_master: &Master) {}
#[cfg(unix)]
fn reap_failed_startup(pid: Option<u32>) {
    if let Some(pid) = pid.and_then(|pid| i32::try_from(pid).ok()) {
        let _ = nix::sys::wait::waitpid(nix::unistd::Pid::from_raw(pid), None);
    }
}
#[cfg(windows)]
fn reap_failed_startup(_pid: Option<u32>) {}
#[cfg(windows)]
fn terminate_group(pid: Option<u32>) {
    use std::os::windows::process::CommandExt;
    if let (Some(pid), Some(root)) = (pid, std::env::var_os("SystemRoot")) {
        let _ = std::process::Command::new(
            std::path::PathBuf::from(root).join("System32/taskkill.exe"),
        )
        .args(["/PID", &pid.to_string(), "/T", "/F"])
        .creation_flags(0x0800_0000)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status();
    }
}
