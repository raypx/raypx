use serde_json::{json, Value};
use std::{
    collections::HashMap,
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc, Arc, Mutex,
    },
    time::{Duration, Instant},
};
use tauri::{ipc::Channel, AppHandle, Manager, State};

pub struct RunnerClient {
    child: Mutex<Child>,
    input: Mutex<ChildStdin>,
    pending: Mutex<HashMap<String, mpsc::Sender<Result<Value, String>>>>,
    subscribers: Mutex<Vec<Channel<Value>>>,
    latest: Mutex<Option<Value>>,
    next_id: AtomicU64,
}
#[derive(Default)]
pub struct RunnerState {
    client: Mutex<Option<Arc<RunnerClient>>>,
    pub quitting: AtomicBool,
}
fn unavailable() -> Value {
    json!({"registrationId":"", "availability":"unavailable", "reason":"The bundled local runner is unavailable.", "deviceId":null, "bindings":[], "runs":[]})
}
impl RunnerClient {
    fn rpc(&self, method: &str, input: Value) -> Result<Value, String> {
        let id = self.next_id.fetch_add(1, Ordering::Relaxed).to_string();
        let (sender, receiver) = mpsc::channel();
        self.pending
            .lock()
            .map_err(|_| "Runner unavailable")?
            .insert(id.clone(), sender);
        let request = json!({"id":id,"method":method,"input":input});
        let write_result = self
            .input
            .lock()
            .map_err(|_| "Runner unavailable")
            .and_then(|mut stdin| writeln!(stdin, "{request}").map_err(|_| "Runner unavailable"));
        if write_result.is_err() {
            self.pending
                .lock()
                .map_err(|_| "Runner unavailable")?
                .remove(&id);
            return Err("Runner unavailable".into());
        }
        let result = receiver
            .recv_timeout(Duration::from_secs(30))
            .map_err(|_| "Runner request timed out".to_owned());
        self.pending
            .lock()
            .map_err(|_| "Runner unavailable")?
            .remove(&id);
        result?
    }
    fn stop(&self) {
        let _ = self.rpc("shutdown", Value::Null);
        let deadline = Instant::now() + Duration::from_secs(5);
        while Instant::now() < deadline {
            if let Ok(mut child) = self.child.lock() {
                if matches!(child.try_wait(), Ok(Some(_))) {
                    return;
                }
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}
pub fn start(app: &tauri::App) -> Result<(), String> {
    let resources = app
        .path()
        .resource_dir()
        .map_err(|_| "Runner resources unavailable")?;
    let bundled = resources.join("runner");
    let directory = if bundled.join("main.mjs").is_file() {
        bundled
    } else if cfg!(debug_assertions) {
        std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("runner")
    } else {
        return Err("Bundled runner not found".into());
    };
    let node = directory.join(if cfg!(windows) { "node.exe" } else { "node" });
    if !node.is_file() || !directory.join("main.mjs").is_file() {
        return Err("Bundled runner not found".into());
    }
    let data = app
        .path()
        .app_data_dir()
        .map_err(|_| "Runner data unavailable")?
        .join("runner");
    let mut child = Command::new(node)
        .arg(directory.join("main.mjs"))
        .arg(data)
        .current_dir(&directory)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|_| "Bundled runner could not start")?;
    let input = child.stdin.take().ok_or("Runner input unavailable")?;
    let output = child.stdout.take().ok_or("Runner output unavailable")?;
    let client = Arc::new(RunnerClient {
        child: Mutex::new(child),
        input: Mutex::new(input),
        pending: Mutex::new(HashMap::new()),
        subscribers: Mutex::new(Vec::new()),
        latest: Mutex::new(None),
        next_id: AtomicU64::new(1),
    });
    let reader = Arc::clone(&client);
    std::thread::spawn(move || {
        for line in BufReader::new(output).lines() {
            let Ok(line) = line else {
                break;
            };
            let Ok(value) = serde_json::from_str::<Value>(&line) else {
                continue;
            };
            if let Some(event) = value.get("event") {
                if let Some(status) = event.get("status") {
                    if let Ok(mut latest) = reader.latest.lock() {
                        *latest = Some(status.clone());
                    }
                }
                if let Ok(mut subscribers) = reader.subscribers.lock() {
                    subscribers.retain(|channel| channel.send(event.clone()).is_ok());
                }
            } else if let Some(id) = value.get("id").and_then(Value::as_str) {
                if let Ok(mut pending) = reader.pending.lock() {
                    if let Some(sender) = pending.remove(id) {
                        let result = value.get("error").and_then(Value::as_str).map_or_else(
                            || Ok(value.get("result").cloned().unwrap_or(Value::Null)),
                            |error| Err(error.to_owned()),
                        );
                        let _ = sender.send(result);
                    }
                }
            }
        }
        if let Ok(mut pending) = reader.pending.lock() {
            for (_, sender) in pending.drain() {
                let _ = sender.send(Err("Local runner stopped".into()));
            }
        }
        if let Ok(mut latest) = reader.latest.lock() {
            *latest = Some(unavailable());
        }
        if let Ok(mut subscribers) = reader.subscribers.lock() {
            subscribers.retain(|channel| {
                channel
                    .send(json!({"type":"status", "status":unavailable()}))
                    .is_ok()
            });
        }
    });
    *app.state::<RunnerState>()
        .client
        .lock()
        .map_err(|_| "Runner unavailable")? = Some(client);
    Ok(())
}
pub fn stop(app: &AppHandle) {
    let client = app
        .state::<RunnerState>()
        .client
        .lock()
        .ok()
        .and_then(|client| client.clone());
    if let Some(client) = client {
        client.stop();
    }
}
async fn request(
    state: State<'_, RunnerState>,
    method: &'static str,
    input: Value,
) -> Result<Value, String> {
    let client = state
        .client
        .lock()
        .map_err(|_| "Runner unavailable")?
        .clone()
        .ok_or("Bundled runner unavailable")?;
    tauri::async_runtime::spawn_blocking(move || client.rpc(method, input))
        .await
        .map_err(|_| "Runner task failed".to_owned())?
}
#[tauri::command]
pub async fn runner_status(state: State<'_, RunnerState>) -> Result<Value, String> {
    if state
        .client
        .lock()
        .map_err(|_| "Runner unavailable")?
        .is_none()
    {
        return Ok(unavailable());
    }
    request(state, "status", Value::Null).await
}
#[tauri::command]
pub async fn runner_configure(
    state: State<'_, RunnerState>,
    input: Value,
) -> Result<Value, String> {
    request(state, "configure", input).await
}
#[tauri::command]
pub async fn runner_grant(state: State<'_, RunnerState>, input: Value) -> Result<Value, String> {
    request(state, "grant", input).await
}
#[tauri::command]
pub async fn runner_revoke(state: State<'_, RunnerState>, input: Value) -> Result<Value, String> {
    request(state, "revoke", input).await
}
#[tauri::command]
pub async fn runner_cancel(state: State<'_, RunnerState>, input: Value) -> Result<Value, String> {
    request(state, "cancel", input).await
}
#[tauri::command]
pub async fn runner_steer(state: State<'_, RunnerState>, input: Value) -> Result<Value, String> {
    request(state, "steer", input).await
}
#[tauri::command]
pub async fn runner_approve(state: State<'_, RunnerState>, input: Value) -> Result<Value, String> {
    request(state, "approve", input).await
}
#[tauri::command]
pub fn runner_subscribe(
    state: State<'_, RunnerState>,
    on_event: Channel<Value>,
) -> Result<(), String> {
    let client = state
        .client
        .lock()
        .map_err(|_| "Runner unavailable")?
        .clone();
    if let Some(client) = client {
        if let Some(status) = client
            .latest
            .lock()
            .map_err(|_| "Runner unavailable")?
            .clone()
        {
            let _ = on_event.send(json!({"type":"status","status":status}));
        }
        client
            .subscribers
            .lock()
            .map_err(|_| "Runner unavailable")?
            .push(on_event);
    } else {
        let _ = on_event.send(json!({"type":"status", "status":unavailable()}));
    }
    Ok(())
}
