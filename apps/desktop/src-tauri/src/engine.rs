use serde_json::{Value, json};
use std::{
    collections::{BTreeMap, HashMap},
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tauri::ipc::Channel;
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    process::{ChildStdin, Command},
    sync::{Mutex as AsyncMutex, Notify, oneshot},
};
use tokio_util::sync::CancellationToken;

pub const LINE_LIMIT: usize = 8 * 1024 * 1024;
const CREDIT_BYTES: usize = 1024 * 1024;

#[derive(Default)]
struct Delivery {
    channel: Option<Channel<Value>>,
    sequence: u64,
    outstanding: BTreeMap<u64, usize>,
    bytes: usize,
    #[cfg(feature = "native-smoke")]
    high_water_bytes: usize,
}

/// The WebView must acknowledge consumption before the child can produce more output.
/// Both the NDJSON read buffer and native-to-WebView in-flight bytes are bounded.
type EventObserver = Arc<dyn Fn(&Value) + Send + Sync>;
#[derive(Default)]
pub struct EventStream {
    delivery: Mutex<Delivery>,
    credit: Notify,
    observer: Mutex<Option<EventObserver>>,
}
impl EventStream {
    #[cfg(feature = "native-smoke")]
    pub fn stream_metrics(&self, reset: bool) -> (u64, usize, usize, bool) {
        let mut delivery = self.delivery.lock().unwrap();
        if reset {
            delivery.high_water_bytes = delivery.bytes;
        }
        (
            delivery.sequence,
            delivery.bytes,
            delivery.high_water_bytes,
            delivery.channel.is_some(),
        )
    }
    #[cfg(feature = "native-smoke")]
    pub async fn stream_flushed(&self, sequence: u64) {
        loop {
            let notified = self.credit.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            if self
                .delivery
                .lock()
                .unwrap()
                .outstanding
                .range(..=sequence)
                .next()
                .is_none()
            {
                return;
            }
            notified.await;
        }
    }
    pub fn observe(&self, observer: EventObserver) {
        *self.observer.lock().unwrap() = Some(observer);
    }
    pub fn subscribe(&self, channel: Channel<Value>) {
        let mut delivery = self.delivery.lock().unwrap();
        delivery.channel = Some(channel);
        delivery.outstanding.clear();
        delivery.bytes = 0;
        drop(delivery);
        self.credit.notify_waiters();
    }
    pub fn acknowledge(&self, sequence: u64) -> bool {
        let mut delivery = self.delivery.lock().unwrap();
        if sequence > delivery.sequence {
            return false;
        }
        let consumed: Vec<_> = delivery
            .outstanding
            .range(..=sequence)
            .map(|(k, v)| (*k, *v))
            .collect();
        for (key, bytes) in consumed {
            delivery.outstanding.remove(&key);
            delivery.bytes -= bytes;
        }
        drop(delivery);
        self.credit.notify_waiters();
        true
    }
    pub async fn send(&self, event: Value, cancelled: &CancellationToken) -> Result<(), String> {
        if cancelled.is_cancelled() {
            return Ok(());
        }
        if let Some(observer) = self.observer.lock().unwrap().clone() {
            observer(&event);
        }
        let bytes = serde_json::to_vec(&event)
            .map_err(|_| "Invalid local event")?
            .len();
        if bytes > LINE_LIMIT {
            return Err("Local event exceeds 8 MiB".into());
        }
        loop {
            if cancelled.is_cancelled() {
                return Ok(());
            }
            let notified = self.credit.notified();
            tokio::pin!(notified);
            notified.as_mut().enable();
            {
                let mut delivery = self.delivery.lock().unwrap();
                let Some(channel) = delivery.channel.clone() else {
                    return Ok(());
                };
                if delivery.bytes == 0 || delivery.bytes + bytes <= CREDIT_BYTES {
                    delivery.sequence += 1;
                    let sequence = delivery.sequence;
                    delivery.outstanding.insert(sequence, bytes);
                    delivery.bytes += bytes;
                    #[cfg(feature = "native-smoke")]
                    {
                        delivery.high_water_bytes = delivery.high_water_bytes.max(delivery.bytes);
                    }
                    if channel
                        .send(json!({"sequence": sequence, "event": event}))
                        .is_err()
                    {
                        delivery.channel = None;
                        delivery.outstanding.clear();
                        delivery.bytes = 0;
                    }
                    return Ok(());
                }
            }
            tokio::select! { _ = notified => {}, _ = cancelled.cancelled() => return Ok(()) }
        }
    }
}

struct Process {
    stdin: ChildStdin,
    cancel: CancellationToken,
    stopped: oneshot::Receiver<()>,
}
type Pending = HashMap<String, oneshot::Sender<Result<Value, String>>>;
struct PendingRequest<'a> {
    pending: &'a Mutex<Pending>,
    id: String,
}
impl Drop for PendingRequest<'_> {
    fn drop(&mut self) {
        self.pending.lock().unwrap().remove(&self.id);
    }
}

pub struct Engine {
    pub binary: PathBuf,
    pub args: Vec<String>,
    pub daemon: bool,
    version: String,
    process: AsyncMutex<Option<Process>>,
    start_lock: AsyncMutex<()>,
    pending: Mutex<Pending>,
    generation: AtomicU64,
    status_cancel: Mutex<CancellationToken>,
    status: Mutex<Value>,
    features: Mutex<Value>,
    pub events: Arc<EventStream>,
}
impl Engine {
    pub fn new(
        binary: PathBuf,
        version: String,
        args: Vec<String>,
        daemon: bool,
        events: Arc<EventStream>,
    ) -> Arc<Self> {
        Arc::new(Self {
            binary,
            args,
            daemon,
            version,
            process: AsyncMutex::new(None),
            start_lock: AsyncMutex::new(()),
            pending: Mutex::new(HashMap::new()),
            generation: AtomicU64::new(0),
            status_cancel: Mutex::new(CancellationToken::new()),
            status: Mutex::new(json!({"status":"starting"})),
            features: Mutex::new(json!({"localTerminalApprovals":false})),
            events,
        })
    }
    pub fn status(&self) -> Value {
        self.status.lock().unwrap().clone()
    }
    pub fn features(&self) -> Value {
        self.features.lock().unwrap().clone()
    }
    fn set_status(&self, value: Value) {
        *self.status.lock().unwrap() = value.clone();
        let events = self.events.clone();
        let cancelled = self.status_cancel.lock().unwrap().clone();
        tauri::async_runtime::spawn(async move {
            let _ = events
                .send(
                    json!({"version":1,"event":"engine.status","data":value}),
                    &cancelled,
                )
                .await;
        });
    }
    fn fail(&self, message: &str, code: Option<&str>) {
        let mut status = json!({"status":"error","message":message});
        if let Some(code) = code {
            status["code"] = json!(code);
        }
        self.set_status(status);
        for (_, sender) in self.pending.lock().unwrap().drain() {
            let _ = sender.send(Err(message.to_owned()));
        }
    }
    pub async fn start(self: &Arc<Self>) -> bool {
        let _starting = self.start_lock.lock().await;
        self.stop().await;
        self.set_status(json!({"status":"starting"}));
        let result = self.start_child().await;
        if let Err(error) = result {
            self.stop().await;
            let mismatch = self.status()["code"] == "HOST_VERSION_MISMATCH";
            self.fail(&error, mismatch.then_some("HOST_VERSION_MISMATCH"));
            return false;
        }
        true
    }
    async fn start_child(self: &Arc<Self>) -> Result<(), String> {
        if !self.binary.is_absolute() {
            return Err("Bundled CLI path must be absolute".into());
        }
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let mut child = Command::new(&self.binary)
            .args(if self.daemon {
                vec!["daemon", "proxy"]
            } else {
                vec!["stdio"]
            })
            .args(&self.args)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(|_| "Bundled CLI could not start")?;
        let stdin = child.stdin.take().ok_or("CLI stdin unavailable")?;
        let stdout = child.stdout.take().ok_or("CLI stdout unavailable")?;
        let mut stderr = child.stderr.take().ok_or("CLI stderr unavailable")?;
        let cancel = CancellationToken::new();
        let (stopped_tx, stopped) = oneshot::channel();
        *self.process.lock().await = Some(Process {
            stdin,
            cancel: cancel.clone(),
            stopped,
        });
        let engine = self.clone();
        let read_cancel = cancel.clone();
        tauri::async_runtime::spawn(async move {
            let mut reader = BufReader::with_capacity(64 * 1024, stdout);
            let mut line = Vec::with_capacity(64 * 1024);
            loop {
                line.clear();
                // take() makes read_until bounded even for a malicious child without a newline.
                let result = (&mut reader)
                    .take((LINE_LIMIT + 1) as u64)
                    .read_until(b'\n', &mut line)
                    .await;
                match result {
                    Ok(0) => break,
                    Ok(_) if generation != engine.generation.load(Ordering::SeqCst) => continue,
                    Ok(_) if line.len() <= LINE_LIMIT && line.last() == Some(&b'\n') => {
                        if line.iter().all(u8::is_ascii_whitespace) {
                            continue;
                        }
                        let value: Value = match serde_json::from_slice(&line) {
                            Ok(value) => value,
                            Err(_) => {
                                engine.fail("Invalid local engine output", None);
                                read_cancel.cancel();
                                break;
                            }
                        };
                        if value["version"] != 1 {
                            engine.fail("Invalid local engine protocol", None);
                            read_cancel.cancel();
                            break;
                        }
                        if value.get("event").and_then(Value::as_str).is_some() {
                            if value["event"] == "engine.status" {
                                if value["data"]["code"] == "HOST_VERSION_MISMATCH" {
                                    engine.fail("The previous execution owner must be stopped before upgrading",Some("HOST_VERSION_MISMATCH"));
                                }
                            } else if engine.events.send(value, &read_cancel).await.is_err() {
                                read_cancel.cancel();
                                break;
                            }
                        } else if let Some(id) = value["id"].as_str() {
                            if let Some(sender) = engine.pending.lock().unwrap().remove(id) {
                                let result = if value.get("error").is_some() {
                                    Err(value["error"]["code"]
                                        .as_str()
                                        .unwrap_or("LOCAL_ERROR")
                                        .to_owned())
                                } else {
                                    Ok(value["result"].clone())
                                };
                                let _ = sender.send(result);
                            }
                        } else {
                            engine.fail("Invalid local engine response", None);
                            read_cancel.cancel();
                            break;
                        }
                    }
                    _ => {
                        engine.fail("Local engine response exceeds the protocol limit", None);
                        read_cancel.cancel();
                        break;
                    }
                }
            }
        });
        // Drain diagnostics without echoing provider output or credentials.
        tauri::async_runtime::spawn(async move {
            let mut bytes = [0u8; 4096];
            while matches!(stderr.read(&mut bytes).await, Ok(1..)) {}
        });
        let engine = self.clone();
        tauri::async_runtime::spawn(async move {
            tokio::select! {
                _ = child.wait() => {},
                _ = cancel.cancelled() => {
                    if tokio::time::timeout(Duration::from_secs(3), child.wait()).await.is_err() { let _ = child.kill().await; let _ = child.wait().await; }
                }
            }
            if generation == engine.generation.load(Ordering::SeqCst)
                && engine.status()["code"] != "HOST_VERSION_MISMATCH"
            {
                engine.fail("Local engine exited; retry to restart", None);
            }
            let _ = stopped_tx.send(());
        });
        let info = self.request("runtime.info", json!({})).await?;
        if info["version"] != self.version
            || info["protocolVersion"] != 1
            || (self.daemon && info["owner"] != "daemon")
        {
            return Err("Bundled CLI version does not match Desktop".into());
        }
        *self.features.lock().unwrap() =
            json!({"localTerminalApprovals":info["features"]["localTerminalApprovals"] == true});
        self.set_status(json!({"status":"ready"}));
        Ok(())
    }
    pub async fn request(&self, method: &str, params: Value) -> Result<Value, String> {
        let id = uuid::Uuid::new_v4().to_string();
        let mut line =
            serde_json::to_vec(&json!({"version":1,"id":id,"method":method,"params":params}))
                .map_err(|_| "Invalid local request")?;
        line.push(b'\n');
        if line.len() > LINE_LIMIT {
            return Err("Local request exceeds 8 MiB".into());
        }
        let (sender, receiver) = oneshot::channel();
        {
            let mut pending = self.pending.lock().unwrap();
            if pending.len() >= 64 {
                return Err("Too many pending local operations".into());
            }
            pending.insert(id.clone(), sender);
        }
        let _pending = PendingRequest {
            pending: &self.pending,
            id: id.clone(),
        };
        let write = async {
            let mut process = self.process.lock().await;
            let process = process.as_mut().ok_or("Local engine is unavailable")?;
            process
                .stdin
                .write_all(&line)
                .await
                .map_err(|_| "Local engine input failed")?;
            process
                .stdin
                .flush()
                .await
                .map_err(|_| "Local engine input failed")
        };
        if !matches!(
            tokio::time::timeout(Duration::from_secs(10), write).await,
            Ok(Ok(()))
        ) {
            self.pending.lock().unwrap().remove(&id);
            return Err("Local engine input failed".into());
        }
        let timeout = Duration::from_secs(if method == "runtime.info" { 10 } else { 86_410 });
        let result = tokio::time::timeout(timeout, receiver).await;
        self.pending.lock().unwrap().remove(&id);
        match result {
            Ok(Ok(result)) => result,
            Ok(Err(_)) => Err("Local engine stopped".into()),
            Err(_) => Err("Local operation timed out".into()),
        }
    }
    pub async fn stop(&self) {
        self.generation.fetch_add(1, Ordering::SeqCst);
        let previous = std::mem::replace(
            &mut *self.status_cancel.lock().unwrap(),
            CancellationToken::new(),
        );
        previous.cancel();
        *self.features.lock().unwrap() = json!({"localTerminalApprovals":false});
        for (_, sender) in self.pending.lock().unwrap().drain() {
            let _ = sender.send(Err("Local engine stopped".into()));
        }
        let process = self.process.lock().await.take();
        if let Some(mut process) = process {
            let _ = process.stdin.shutdown().await;
            drop(process.stdin);
            process.cancel.cancel();
            let _ = tokio::time::timeout(Duration::from_secs(4), &mut process.stopped).await;
        }
    }
    pub async fn replace_owner(self: &Arc<Self>) -> bool {
        if !self.daemon || self.status()["code"] != "HOST_VERSION_MISMATCH" {
            return false;
        }
        self.restart_owner().await
    }
    #[cfg(feature = "native-smoke")]
    pub async fn force_replace_owner(self: &Arc<Self>) -> bool {
        if !self.daemon {
            return self.start().await;
        }
        self.restart_owner().await
    }
    async fn restart_owner(self: &Arc<Self>) -> bool {
        self.stop().await;
        let status = Command::new(&self.binary)
            .args(["daemon", "restart"])
            .args(&self.args)
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true)
            .status();
        if !matches!(tokio::time::timeout(Duration::from_secs(30),status).await,Ok(Ok(status)) if status.success())
        {
            self.fail(
                "The previous daemon could not be replaced",
                Some("HOST_VERSION_MISMATCH"),
            );
            return false;
        }
        self.start().await
    }
}
