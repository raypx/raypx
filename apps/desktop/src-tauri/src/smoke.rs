//! Release-configuration acceptance driver, excluded entirely from normal builds.
use crate::{Desktop, engine::LINE_LIMIT};
use serde_json::{Value, json};
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tauri::{Manager, WebviewWindow};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt, BufReader};

pub fn start(app: tauri::AppHandle) -> Result<(), Box<dyn std::error::Error>> {
    let endpoint = std::env::var("RAYPX_NATIVE_SMOKE_SOCKET")?;
    let token = std::env::var("RAYPX_NATIVE_SMOKE_TOKEN")?;
    if token.len() < 32 || token.len() > 256 {
        return Err("Native smoke token must be 32–256 bytes".into());
    }
    let permits = Arc::new(tokio::sync::Semaphore::new(4));
    #[cfg(unix)]
    {
        use std::path::PathBuf;
        let endpoint = PathBuf::from(endpoint);
        if !endpoint.is_absolute() {
            return Err("Native smoke socket must be absolute".into());
        }
        let listener = bind_local_socket(&endpoint)?;
        tauri::async_runtime::spawn(async move {
            loop {
                let Ok((stream, _)) = listener.accept().await else {
                    break;
                };
                let Ok(permit) = permits.clone().try_acquire_owned() else {
                    continue;
                };
                let app = app.clone();
                let token = token.clone();
                tauri::async_runtime::spawn(async move {
                    let _permit = permit;
                    let _ = serve(stream, app, &token).await;
                });
            }
            let _ = std::fs::remove_file(endpoint);
        });
    }
    #[cfg(windows)]
    {
        use tokio::net::windows::named_pipe::ServerOptions;
        if !endpoint.starts_with(r"\\.\pipe\raypx-native-smoke-") {
            return Err("Native smoke pipe name is invalid".into());
        }
        let first = bind_local_pipe(&endpoint)?;
        tauri::async_runtime::spawn(async move {
            let mut server = first;
            loop {
                if server.connect().await.is_err() {
                    break;
                }
                let next = match ServerOptions::new()
                    .reject_remote_clients(true)
                    .create(&endpoint)
                {
                    Ok(next) => next,
                    Err(_) => break,
                };
                if let Ok(permit) = permits.clone().try_acquire_owned() {
                    let app = app.clone();
                    let token = token.clone();
                    tauri::async_runtime::spawn(async move {
                        let _permit = permit;
                        let _ = serve(server, app, &token).await;
                    });
                }
                server = next;
            }
        });
    }
    Ok(())
}
fn same_token(provided: &str, expected: &str) -> bool {
    provided.len() == expected.len()
        && provided
            .bytes()
            .zip(expected.bytes())
            .fold(0u8, |different, (a, b)| different | (a ^ b))
            == 0
}
async fn serve(
    stream: impl AsyncRead + AsyncWrite + Unpin + Send + 'static,
    app: tauri::AppHandle,
    token: &str,
) -> Result<(), String> {
    let (reader, writer) = tokio::io::split(stream);
    let writer = Arc::new(tokio::sync::Mutex::new(writer));
    let mut reader = BufReader::new(reader);
    let mut line = Vec::new();
    let permits = Arc::new(tokio::sync::Semaphore::new(64));
    let mut tasks = tokio::task::JoinSet::new();
    loop {
        while tasks.try_join_next().is_some() {}
        line.clear();
        let bytes = tokio::time::timeout(
            Duration::from_secs(60),
            (&mut reader)
                .take((LINE_LIMIT + 1) as u64)
                .read_until(b'\n', &mut line),
        )
        .await
        .map_err(|_| "Smoke request timed out")?
        .map_err(|_| "Smoke socket closed")?;
        if bytes == 0 {
            return Ok(());
        }
        if bytes > LINE_LIMIT || line.last() != Some(&b'\n') {
            return Err("Smoke request too large".into());
        }
        let request: Value = serde_json::from_slice(&line).map_err(|_| "Invalid smoke request")?;
        if !same_token(request["token"].as_str().unwrap_or(""), token) {
            return Err("Invalid smoke token".into());
        }
        let permit = permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| "Too many native smoke operations")?;
        let app = app.clone();
        let writer = writer.clone();
        tasks.spawn(async move {
            let _permit = permit;
            let result = dispatch(
                &app,
                request["method"].as_str().unwrap_or(""),
                request["input"].clone(),
            )
            .await;
            let response = match result {
                Ok(value) => json!({"id":request["id"],"ok":true,"value":value}),
                Err(error) => json!({"id":request["id"],"ok":false,"error":error}),
            };
            let Ok(mut bytes) = serde_json::to_vec(&response) else {
                return;
            };
            bytes.push(b'\n');
            let mut writer = writer.lock().await;
            let _ = writer.write_all(&bytes).await;
            let _ = writer.flush().await;
        });
    }
}

async fn callback(window: &WebviewWindow, script: String) -> Result<Value, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    let tx = Mutex::new(Some(tx));
    window
        .eval_with_callback(script, move |result| {
            if let Some(tx) = tx.lock().unwrap().take() {
                let _ = tx.send(result);
            }
        })
        .map_err(|_| "Smoke evaluation unavailable")?;
    let raw = tokio::time::timeout(Duration::from_secs(5), rx)
        .await
        .map_err(|_| "Smoke evaluation callback timed out")?
        .map_err(|_| "Smoke evaluation callback closed")?;
    serde_json::from_str(&raw).map_err(|_| "Invalid smoke evaluation result".into())
}
async fn evaluate(window: &WebviewWindow, script: &str) -> Result<Value, String> {
    if script.len() > 1024 * 1024 {
        return Err("Smoke script too large".into());
    }
    let state = window.state::<Arc<Desktop>>();
    let ready_deadline = tokio::time::Instant::now() + Duration::from_secs(30);
    while !state.page_ready.load(std::sync::atomic::Ordering::SeqCst) {
        if tokio::time::Instant::now() > ready_deadline {
            return Err("Native page did not finish loading".into());
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    let id = serde_json::to_string(&uuid::Uuid::new_v4().to_string()).unwrap();
    let source = format!(
        "(()=>{{window.__raypxSmokeResults??=Object.create(null);void(async()=>{{try{{const value=await(async()=>{{{script}\n}})();window.__raypxSmokeResults[{id}]={{ok:true,value:value??null}};}}catch{{window.__raypxSmokeResults[{id}]={{ok:false}};}}}})();return null;}})()"
    );
    callback(window, source).await?;
    let deadline = tokio::time::Instant::now() + Duration::from_secs(30);
    loop {
        let result=callback(window,format!("(()=>{{const result=window.__raypxSmokeResults?.[{id}];if(result){{delete window.__raypxSmokeResults[{id}];return result;}}return null;}})()")).await?;
        if result.is_object() {
            return if result["ok"] == true {
                Ok(result["value"].clone())
            } else {
                Err("Native smoke evaluation failed".into())
            };
        }
        if tokio::time::Instant::now() > deadline {
            return Err("Native smoke evaluation timed out".into());
        }
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
}
async fn dispatch(app: &tauri::AppHandle, method: &str, input: Value) -> Result<Value, String> {
    let window = app
        .get_webview_window("main")
        .ok_or("Main window unavailable")?;
    let state = app.state::<Arc<Desktop>>();
    match method {
        "eval" => {
            evaluate(
                &window,
                input["script"].as_str().ok_or("Missing smoke script")?,
            )
            .await
        }
        "runtime" => Ok(crate::runtime(&state)),
        "engineRequest" => {
            state
                .engine
                .request(
                    input["method"].as_str().ok_or("Missing local method")?,
                    input["params"].clone(),
                )
                .await
        }
        "apiRequest" => crate::request_api(&state, input).await,
        "apiTrace" => Ok(json!(state.api_trace.lock().unwrap().clone())),
        "cors" => crate::smoke_cors::probe(app, input).await,
        "cleanupSessionKeys" => {
            let directory = std::env::var_os("RAYPX_NATIVE_SMOKE_DATA_DIR")
                .map(std::path::PathBuf::from)
                .ok_or("Native smoke data directory is missing")?;
            let count = cleanup_session_keys(&directory, crate::cookies::remove_smoke_session_key)?;
            crate::prefs::atomic_write(&directory.join(".native-smoke-sessions-cleaned"), b"true")
                .map_err(|_| "Unable to record native smoke session cleanup")?;
            Ok(json!(count))
        }
        "engineReplace" => Ok(json!(state.engine.force_replace_owner().await)),
        "stream" => stream(&window, &state, input).await,
        "engineStop" => {
            state.engine.stop().await;
            Ok(json!(true))
        }
        "refreshGrant" => Ok(json!(state.control.refresh_grant().await?)),
        "windowState" => {
            let scale = window
                .scale_factor()
                .map_err(|_| "Window scale unavailable")?;
            let size = window
                .inner_size()
                .map_err(|_| "Window size unavailable")?
                .to_logical::<f64>(scale);
            let tray = app.tray_by_id("main");
            let rect = tray.as_ref().and_then(|tray| tray.rect().ok().flatten());
            let tray_bounds = rect.map(|rect| {
                let size = rect.size.to_logical::<f64>(scale);
                json!({"width":size.width,"height":size.height})
            });
            Ok(
                json!({"visible":window.is_visible().unwrap_or(false),"focused":window.is_focused().unwrap_or(false),"minimized":window.is_minimized().unwrap_or(false),"width":size.width,"height":size.height,"scaleFactor":scale,"trayVisible":state.tray.load(std::sync::atomic::Ordering::SeqCst),"trayBounds":tray_bounds}),
            )
        }
        "show" => {
            crate::show(&window);
            state.lease.update(&window).await;
            Ok(json!(true))
        }
        "hide" => {
            window.hide().map_err(|_| "Unable to hide window")?;
            state.lease.update(&window).await;
            Ok(json!(true))
        }
        "close" => {
            window.close().map_err(|_| "Unable to close window")?;
            Ok(json!(true))
        }
        "resize" => {
            let width = input["width"].as_f64().ok_or("Missing width")?;
            let height = input["height"].as_f64().ok_or("Missing height")?;
            if !width.is_finite()
                || !height.is_finite()
                || !(1.0..=16384.0).contains(&width)
                || !(1.0..=16384.0).contains(&height)
            {
                return Err("Invalid window size".into());
            }
            window
                .set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }))
                .map_err(|_| "Unable to resize window")?;
            Ok(json!(true))
        }
        "tray" => {
            crate::tray_action(
                &window,
                input["action"].as_str().ok_or("Missing tray action")?,
            );
            Ok(json!(true))
        }
        "quit" => {
            crate::shutdown_with_code(
                app.clone(),
                input["code"].as_i64().unwrap_or(0).clamp(0, 255) as i32,
            );
            Ok(json!(true))
        }
        _ => Err("Unknown native smoke method".into()),
    }
}

/// Teardown can only visit the runner-owned smoke directory and valid native server scopes.
/// No caller can supply a key service, key identity or replacement directory over the socket.
pub fn cleanup_session_keys(
    directory: &std::path::Path,
    mut remove: impl FnMut(&std::path::Path) -> Result<(), String>,
) -> Result<usize, String> {
    fn plain(path: &std::path::Path, directory: bool) -> bool {
        std::fs::symlink_metadata(path).is_ok_and(|metadata| {
            !metadata.is_symlink()
                && if directory {
                    metadata.is_dir()
                } else {
                    metadata.is_file()
                }
        })
    }
    let marker = directory.join(".native-smoke-session-owner");
    if !directory.is_absolute()
        || !plain(directory, true)
        || !plain(&marker, false)
        || crate::config::read_bounded(&marker, 64).ok().as_deref()
            != Some(b"raypx-native-smoke-v1\n")
    {
        return Err("Native smoke session cleanup requires an owned isolated directory".into());
    }
    let servers = directory.join("servers");
    if !servers.exists() {
        return Ok(0);
    }
    if !plain(&servers, true) {
        return Err("Unsafe native smoke server directory".into());
    }
    let entries =
        std::fs::read_dir(servers).map_err(|_| "Unable to read native smoke server scopes")?;
    let mut count = 0;
    for entry in entries {
        let entry = entry.map_err(|_| "Unable to read native smoke server scope")?;
        let name = entry.file_name();
        let Some(name) = name.to_str() else { continue };
        if name.len() != 32
            || !name
                .bytes()
                .all(|value| value.is_ascii_digit() || (b'a'..=b'f').contains(&value))
            || !plain(&entry.path(), true)
        {
            continue;
        }
        let marker = entry.path().join("tauri-session-v2");
        if !plain(&marker, false)
            || crate::config::read_bounded(&marker, 4).ok().as_deref() != Some(b"2")
        {
            continue;
        }
        remove(&entry.path())?;
        count += 1;
    }
    Ok(count)
}

async fn stream(window: &WebviewWindow, state: &Desktop, input: Value) -> Result<Value, String> {
    use base64::Engine as _;
    let duration = input["durationMs"]
        .as_u64()
        .unwrap_or(2000)
        .clamp(100, 10_000);
    let rate = input["bytesPerSecond"]
        .as_u64()
        .unwrap_or(10 * 1024 * 1024)
        .clamp(1024 * 1024, 100 * 1024 * 1024);
    if !state.events.stream_metrics(true).3 {
        return Err("Renderer has not subscribed to local events".into());
    }
    let id = uuid::Uuid::new_v4().to_string();
    callback(window, stream_observer_script(&id)).await?;
    let packet_bytes = 32 * 1024usize;
    let packets = (rate * duration / 1000).div_ceil(packet_bytes as u64);
    let data = base64::engine::general_purpose::STANDARD.encode(vec![b'x'; packet_bytes]);
    let mut pacing =
        tokio::time::interval(Duration::from_secs_f64(packet_bytes as f64 / rate as f64));
    pacing.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    let started = tokio::time::Instant::now();
    let cancelled = tokio_util::sync::CancellationToken::new();
    let result=tokio::time::timeout(Duration::from_millis(duration+10_000),async{
        for index in 0..packets{pacing.tick().await;state.events.send(json!({"version":1,"event":"terminal.output","data":{"terminalId":"native-smoke-stream","data":data,"nativeSmokeStream":id,"streamIndex":index,"rawBytes":packet_bytes}}),&cancelled).await?;}
        let sequence=state.events.stream_metrics(false).0;
        state.events.stream_flushed(sequence).await;
        Ok::<(),String>(())
    }).await;
    let elapsed = started.elapsed();
    let metrics = state.events.stream_metrics(false);
    let renderer=callback(window,"(()=>{window.__raypxSmokeStreamRestore?.();delete window.__raypxSmokeStreamRestore;const stats=window.__raypxSmokeStreamStats;delete window.__raypxSmokeStreamStats;return stats;})()".into()).await?;
    result.map_err(|_| "Renderer stream timed out")??;
    Ok(
        json!({"renderer":renderer,"packets":packets,"bytes":packets*packet_bytes as u64,"elapsedMs":elapsed.as_millis(),"bytesPerSecond":packets as f64*packet_bytes as f64/elapsed.as_secs_f64(),"outstandingBytes":metrics.1,"maxOutstandingBytes":metrics.2,"creditBytes":1024*1024}),
    )
}

#[cfg(unix)]
pub fn bind_local_socket(endpoint: &std::path::Path) -> std::io::Result<tokio::net::UnixListener> {
    use std::os::unix::fs::PermissionsExt;
    let listener =
        tauri::async_runtime::block_on(async { tokio::net::UnixListener::bind(endpoint) })?;
    std::fs::set_permissions(endpoint, std::fs::Permissions::from_mode(0o600))?;
    Ok(listener)
}
#[cfg(windows)]
pub fn bind_local_pipe(
    endpoint: &str,
) -> std::io::Result<tokio::net::windows::named_pipe::NamedPipeServer> {
    tauri::async_runtime::block_on(async {
        tokio::net::windows::named_pipe::ServerOptions::new()
            .first_pipe_instance(true)
            .reject_remote_clients(true)
            .create(endpoint)
    })
}

/// Count when the application's event validator reads each packet, after the
/// SDK Channel has restored transport order. Core's runCallback is read-only.
pub fn stream_observer_script(id: &str) -> String {
    let quoted = serde_json::to_string(id).unwrap();
    format!(
        r#"(()=>{{
        const callbacks=window.__TAURI_INTERNALS__.callbacks;
        const stats=window.__raypxSmokeStreamStats={{id:{quoted},count:0,bytes:0,ordered:true,intact:true,rawReceived:0,hookedCallbacks:callbacks.size}};
        const originals=[];
        for(const [callbackId,original] of callbacks){{
            const wrapped=(raw)=>{{
                const event=raw?.message?.event;
                const data=event?.data;
                if(data?.nativeSmokeStream===stats.id){{
                    stats.rawReceived++;
                    let consumed=false;
                    Object.defineProperty(event,'data',{{enumerable:true,configurable:true,get(){{
                        if(!consumed){{
                            consumed=true;
                            const bytes=atob(data.data);
                            stats.ordered&&=data.streamIndex===stats.count;
                            stats.intact&&=bytes==='x'.repeat(data.rawBytes);
                            stats.count++;
                            stats.bytes+=bytes.length;
                        }}
                        return data;
                    }}}});
                }}
                return original(raw);
            }};
            originals.push([callbackId,original,wrapped]);
            callbacks.set(callbackId,wrapped);
        }}
        window.__raypxSmokeStreamRestore=()=>{{for(const [id,original,wrapped] of originals){{if(callbacks.get(id)===wrapped)callbacks.set(id,original);}}}};
        return true;
    }})()"#
    )
}
