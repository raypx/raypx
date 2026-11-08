use crate::{Error, LINE_LIMIT, Result, events::Events, fail};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    path::PathBuf,
    process::Stdio,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{ChildStdin, Command},
    sync::{Mutex as AsyncMutex, oneshot},
};
use tokio_util::sync::CancellationToken;

struct Process {
    generation: u64,
    input: AsyncMutex<ChildStdin>,
    cancel: CancellationToken,
    done: CancellationToken,
}
struct State {
    process: Option<Arc<Process>>,
    pending: HashMap<String, oneshot::Sender<Result<Value>>>,
    status: Value,
    features: Value,
}
pub struct Engine {
    pub binary: PathBuf,
    args: Vec<String>,
    version: String,
    built_at: u64,
    daemon: bool,
    pub events: Arc<Events>,
    state: Mutex<State>,
    start: AsyncMutex<()>,
    serial: AtomicU64,
    generation: AtomicU64,
    closed: AtomicBool,
}
struct Pending<'a> {
    engine: &'a Engine,
    id: String,
}
impl Drop for Pending<'_> {
    fn drop(&mut self) {
        self.engine.state.lock().unwrap().pending.remove(&self.id);
    }
}
impl Engine {
    pub fn new(
        binary: PathBuf,
        args: Vec<String>,
        version: String,
        built_at: u64,
        daemon: bool,
        events: Arc<Events>,
    ) -> Arc<Self> {
        Arc::new(Self {
            binary,
            args,
            version,
            built_at,
            daemon,
            events,
            state: Mutex::new(State {
                process: None,
                pending: HashMap::new(),
                status: json!({"status":"starting"}),
                features: json!({"localTerminalApprovals":false}),
            }),
            start: AsyncMutex::new(()),
            serial: AtomicU64::new(0),
            generation: AtomicU64::new(0),
            closed: AtomicBool::new(false),
        })
    }
    pub fn status(&self) -> Value {
        self.state.lock().unwrap().status.clone()
    }
    pub fn features(&self) -> Value {
        self.state.lock().unwrap().features.clone()
    }
    async fn status_changed(&self, generation: u64, value: Value) {
        {
            let mut state = self.state.lock().unwrap();
            if self.generation.load(Ordering::SeqCst) != generation
                || (state.status["code"] == "HOST_VERSION_MISMATCH"
                    && value["code"] != "HOST_VERSION_MISMATCH")
            {
                return;
            }
            state.status = value.clone();
        }
        let cancel = CancellationToken::new();
        let _ = tokio::time::timeout(
            Duration::from_secs(2),
            self.events.send(
                json!({"version":1,"event":"engine.status","data":value}),
                &cancel,
            ),
        )
        .await;
    }
    pub async fn start(self: &Arc<Self>, replace: bool) -> Result<bool> {
        let _guard = self.start.lock().await;
        if self.closed.load(Ordering::SeqCst) {
            return fail("CLOSING");
        }
        if replace {
            if !self.daemon || self.status()["code"] != "HOST_VERSION_MISMATCH" {
                return Ok(false);
            }
            self.stop().await;
            let mut command = command(&self.binary);
            command
                .args(["daemon", "restart"])
                .args(&self.args)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .kill_on_drop(true);
            let status = tokio::time::timeout(Duration::from_secs(30), command.status())
                .await
                .map_err(|_| "HOST_STOPPING")??;
            if !status.success() {
                return fail("HOST_STOPPING");
            }
        } else {
            self.stop().await;
        }
        if !self.binary.is_absolute() {
            return fail("CLI_PATH_INVALID");
        }
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        {
            let mut state = self.state.lock().unwrap();
            state.status = json!({"status":"starting"});
        }
        self.status_changed(generation, json!({"status":"starting"}))
            .await;
        let mut command = command(&self.binary);
        if self.daemon {
            command.args(["daemon", "proxy"]);
        } else {
            command.arg("stdio");
        }
        command
            .args(&self.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        let mut child = command.spawn()?;
        let stdout = child.stdout.take().ok_or("CLI_UNAVAILABLE")?;
        let process = Arc::new(Process {
            generation,
            input: AsyncMutex::new(child.stdin.take().ok_or("CLI_UNAVAILABLE")?),
            cancel: CancellationToken::new(),
            done: CancellationToken::new(),
        });
        self.state.lock().unwrap().process = Some(process.clone());
        let engine = self.clone();
        let reader_process = process.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout);
            let mut line = Vec::new();
            let result: Result<()> = async {
                loop {
                    let chunk = tokio::select! { value = reader.fill_buf() => value?, _ = reader_process.cancel.cancelled() => return Ok(()) };
                    if chunk.is_empty() { if !line.is_empty() { return fail("INVALID_LOCAL_PROTOCOL"); } break; }
                    let end = chunk.iter().position(|c| *c == b'\n').map(|i| i + 1); let n = end.unwrap_or(chunk.len());
                    if line.len() + n > LINE_LIMIT { return fail("INVALID_LOCAL_PROTOCOL"); }
                    line.extend_from_slice(&chunk[..n]); reader.consume(n);
                    if end.is_none() { continue; }
                    if line.iter().all(|c| c.is_ascii_whitespace()) { line.clear(); continue; }
                    let packet: Value = serde_json::from_slice(&line)?; line.clear();
                    if packet["version"] != 1 { return fail("INVALID_LOCAL_PROTOCOL"); }
                    if engine.generation.load(Ordering::SeqCst) != generation { return Ok(()); }
                    if let Some(event) = packet["event"].as_str() {
                        if event == "engine.status" {
                            if packet["data"]["code"] == "HOST_VERSION_MISMATCH" { engine.status_changed(generation,json!({"status":"error","code":"HOST_VERSION_MISMATCH"})).await; }
                        } else { engine.events.send(packet, &reader_process.cancel).await?; }
                    } else if let Some(id) = packet["id"].as_str() {
                        let sender = engine.state.lock().unwrap().pending.remove(id);
                        if let Some(sender) = sender {
                            let result = if let Some(error) = packet.get("error") { let code = error["code"].as_str().filter(|s| s.len() <= 128 && s.bytes().all(|b| b.is_ascii_uppercase() || b == b'_')).unwrap_or("LOCAL_ERROR"); Err(Error(code.into())) } else { Ok(packet["result"].clone()) };
                            let _ = sender.send(result);
                        }
                    } else { return fail("INVALID_LOCAL_PROTOCOL"); }
                }
                Ok(())
            }.await;
            if result.is_err() {
                engine
                    .status_changed(
                        generation,
                        json!({"status":"error","code":"INVALID_LOCAL_PROTOCOL"}),
                    )
                    .await;
            }
            reader_process.cancel.cancel();
        });
        let engine = self.clone();
        let waiter = process.clone();
        tokio::spawn(async move {
            tokio::select! { _ = child.wait() => {}, _ = waiter.cancel.cancelled() => { if tokio::time::timeout(Duration::from_secs(3), async { let _ = waiter.input.lock().await.shutdown().await; let _ = child.wait().await; }).await.is_err() { let _ = child.kill().await; } } }
            waiter.cancel.cancel();
            waiter.done.cancel();
            if engine.generation.load(Ordering::SeqCst) == generation {
                {
                    let mut state = engine.state.lock().unwrap();
                    for (_, sender) in state.pending.drain() {
                        let _ = sender.send(fail("ENGINE_STOPPED"));
                    }
                }
                engine
                    .status_changed(
                        generation,
                        json!({"status":"error","code":"ENGINE_STOPPED"}),
                    )
                    .await;
            }
        });
        let info = self.request("runtime.info", json!({})).await;
        match info {
            Ok(info)
                if info["version"] == self.version
                    && info["protocolVersion"] == 1
                    && info["builtAt"] == self.built_at
                    && (!self.daemon || info["owner"] == "daemon") =>
            {
                self.state.lock().unwrap().features = json!({"localTerminalApprovals":info["features"]["localTerminalApprovals"] == true});
                self.status_changed(generation, json!({"status":"ready"}))
                    .await;
                Ok(true)
            }
            _ => {
                let mismatch = self.status()["code"] == "HOST_VERSION_MISMATCH";
                self.stop().await;
                self.status_changed(self.generation.load(Ordering::SeqCst),json!({"status":"error","code":if mismatch {"HOST_VERSION_MISMATCH"} else {"CLI_VERSION_MISMATCH"}})).await;
                Ok(false)
            }
        }
    }
    pub async fn request(&self, method: &str, params: Value) -> Result<Value> {
        if self.closed.load(Ordering::SeqCst) {
            return fail("CLOSING");
        }
        let id = format!("desktop-{}", self.serial.fetch_add(1, Ordering::SeqCst));
        let mut bytes =
            serde_json::to_vec(&json!({"version":1,"id":id,"method":method,"params":params}))?;
        bytes.push(b'\n');
        if bytes.len() > LINE_LIMIT {
            return fail("REQUEST_LIMIT");
        }
        let (sender, receiver) = oneshot::channel();
        let process = {
            let mut state = self.state.lock().unwrap();
            let process = state
                .process
                .clone()
                .filter(|p| !p.cancel.is_cancelled())
                .ok_or("ENGINE_UNAVAILABLE")?;
            if state.pending.len() >= 64 {
                return fail("ENGINE_BUSY");
            }
            state.pending.insert(id.clone(), sender);
            process
        };
        let _pending = Pending {
            engine: self,
            id: id.clone(),
        };
        // Allow owner turnover and daemon startup, plus the cold runtime copy on Windows.
        let response_timeout = Duration::from_secs(match method {
            "runtime.info" if self.daemon && cfg!(windows) => 75,
            "runtime.info" if self.daemon => 30,
            "runtime.info" => 10,
            _ => 86410,
        });
        let result = async {
            let written = tokio::time::timeout(Duration::from_secs(10), async {
                let mut input = process.input.lock().await;
                input.write_all(&bytes).await?;
                input.flush().await
            })
            .await;
            if !matches!(written, Ok(Ok(()))) {
                process.cancel.cancel();
                return fail("ENGINE_INPUT_FAILED");
            }
            tokio::select! {
                value = receiver => value.map_err(|_| "ENGINE_STOPPED")?,
                _ = process.cancel.cancelled() => fail("ENGINE_STOPPED"),
                _ = tokio::time::sleep(response_timeout) => fail("ENGINE_TIMEOUT"),
            }
        }
        .await;
        if self.generation.load(Ordering::SeqCst) == process.generation {
            self.state.lock().unwrap().pending.remove(&id);
        }
        result
    }
    pub async fn stop(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        let process = {
            let mut state = self.state.lock().unwrap();
            state.features = json!({"localTerminalApprovals":false});
            for (_, sender) in state.pending.drain() {
                let _ = sender.send(fail("ENGINE_STOPPED"));
            }
            state.process.take()
        };
        if let Some(process) = process {
            process.cancel.cancel();
            let _ = tokio::time::timeout(Duration::from_secs(4), process.done.cancelled()).await;
        }
    }
    pub async fn close(&self) {
        self.closed.store(true, Ordering::SeqCst);
        self.stop().await;
        let _guard = self.start.lock().await;
        self.stop().await;
    }
}
pub fn command(binary: &std::path::Path) -> Command {
    #[allow(unused_mut)]
    let mut command = Command::new(binary);
    #[cfg(windows)]
    {
        command.creation_flags(0x08000000);
    }
    command
}
