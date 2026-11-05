//! Authenticated acceptance controls, excluded from production at compile time.
use crate::{LINE_LIMIT, Result, fail, host::Host};
use base64::{Engine as _, engine::general_purpose::STANDARD};
use serde_json::{Value, json};
use std::{
    sync::{
        Arc, Mutex,
        atomic::{AtomicU64, Ordering},
    },
    time::Duration,
};
use tauri::WebviewWindow;
use tokio::{
    io::{AsyncBufReadExt, AsyncRead, AsyncWrite, AsyncWriteExt, BufReader},
    sync::{Mutex as AsyncMutex, Semaphore},
};

pub fn start(app: tauri::AppHandle, window: WebviewWindow, host: Arc<Host>) -> Result<()> {
    let endpoint =
        std::env::var("RAYPX_NATIVE_SMOKE_SOCKET").map_err(|_| "SMOKE_ENDPOINT_REQUIRED")?;
    let token = std::env::var("RAYPX_NATIVE_SMOKE_TOKEN").map_err(|_| "SMOKE_TOKEN_REQUIRED")?;
    if !(32..=256).contains(&token.len()) {
        return fail("SMOKE_TOKEN_REQUIRED");
    }
    let focuses = Arc::new(AtomicU64::new(0));
    let counter = focuses.clone();
    window.on_window_event(move |event| {
        if matches!(event, tauri::WindowEvent::Focused(true)) {
            counter.fetch_add(1, Ordering::SeqCst);
        }
    });
    let dispatch = Arc::new(Driver {
        app,
        window,
        host,
        focuses,
    });
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if !std::path::Path::new(&endpoint).is_absolute() {
            return fail("INVALID_SMOKE_SOCKET");
        }
        let listener = tokio::net::UnixListener::bind(&endpoint)?;
        std::fs::set_permissions(&endpoint, std::fs::Permissions::from_mode(0o600))?;
        tauri::async_runtime::spawn(async move {
            let permits = Arc::new(Semaphore::new(4));
            let cancel = dispatch.host.cancelled();
            loop {
                tokio::select! { _ = cancel.cancelled() => break, accepted=listener.accept() => {
                    let Ok((stream,_))=accepted else {break;};let Ok(permit)=permits.clone().try_acquire_owned() else {continue;};let driver=dispatch.clone();let token=token.clone();
                    tokio::spawn(async move {let _permit=permit;let _=serve(stream,token,driver).await;});
                }}
            }
            let _ = std::fs::remove_file(endpoint);
        });
    }
    #[cfg(windows)]
    {
        use tokio::net::windows::named_pipe::ServerOptions;
        if !endpoint.starts_with(r"\\.\pipe\raypx-native-smoke-") {
            return fail("INVALID_SMOKE_SOCKET");
        }
        let initial = ServerOptions::new()
            .first_pipe_instance(true)
            .reject_remote_clients(true)
            .create(&endpoint)?;
        tauri::async_runtime::spawn(async move {
            let permits = Arc::new(Semaphore::new(4));
            let cancel = dispatch.host.cancelled();
            let mut listener = initial;
            loop {
                tokio::select! { _ = cancel.cancelled() => break, connected=listener.connect() => {
                    if connected.is_err() {break;}
                    let Ok(next)=ServerOptions::new().reject_remote_clients(true).create(&endpoint) else {break;};let stream=std::mem::replace(&mut listener,next);
                    let Ok(permit)=permits.clone().try_acquire_owned() else {continue;};let driver=dispatch.clone();let token=token.clone();
                    tokio::spawn(async move {let _permit=permit;let _=serve(stream,token,driver).await;});
                }}
            }
        });
    }
    Ok(())
}
struct Driver {
    app: tauri::AppHandle,
    window: WebviewWindow,
    host: Arc<Host>,
    focuses: Arc<AtomicU64>,
}
async fn serve<S: AsyncRead + AsyncWrite + Unpin + Send + 'static>(
    stream: S,
    token: String,
    driver: Arc<Driver>,
) -> Result<()> {
    use subtle::ConstantTimeEq;
    let (reader, writer) = tokio::io::split(stream);
    let mut reader = BufReader::new(reader);
    let writer = Arc::new(AsyncMutex::new(writer));
    let permits = Arc::new(Semaphore::new(64));
    let lifetime = driver.host.cancelled();
    loop {
        let mut line = Vec::new();
        let read = async {
            loop {
                let data = reader.fill_buf().await?;
                if data.is_empty() {
                    return Ok::<_, std::io::Error>(false);
                }
                let end = data.iter().position(|b| *b == b'\n').map(|p| p + 1);
                let n = end.unwrap_or(data.len());
                if line.len() + n > LINE_LIMIT {
                    return Ok(false);
                }
                line.extend_from_slice(&data[..n]);
                reader.consume(n);
                if end.is_some() {
                    return Ok(true);
                }
            }
        };
        let available = tokio::select! {_ = lifetime.cancelled() => return Ok(()), read=tokio::time::timeout(Duration::from_secs(60),read) => read.map_err(|_|"SMOKE_READ_TIMEOUT")??};
        if !available {
            return Ok(());
        }
        let request: Value = serde_json::from_slice(&line)?;
        let supplied = request["token"].as_str().unwrap_or("");
        if !bool::from(token.as_bytes().ct_eq(supplied.as_bytes())) {
            return fail("INVALID_SMOKE_TOKEN");
        }
        let id = request["id"]
            .as_str()
            .filter(|s| !s.is_empty() && s.len() <= 128)
            .ok_or("INVALID_SMOKE_REQUEST")?
            .to_owned();
        let permit = permits
            .clone()
            .try_acquire_owned()
            .map_err(|_| "SMOKE_BUSY")?;
        let driver = driver.clone();
        let writer = writer.clone();
        let lifetime = lifetime.clone();
        tokio::spawn(async move {
            let _permit = permit;
            let method = request["method"].as_str().unwrap_or("");
            let input = request["input"].clone();
            let result = tokio::select! {_ = lifetime.cancelled() => fail("CLOSING"), result=tokio::time::timeout(Duration::from_secs(30),driver.dispatch(method,input)) => result.unwrap_or_else(|_|fail("SMOKE_TIMEOUT"))};
            let response = match result {
                Ok(value) => json!({"id":id,"ok":true,"value":value}),
                Err(error) => {
                    json!({"id":id,"ok":false,"error":if method=="engineRequest" {error.0} else {"SMOKE_OPERATION_FAILED".into()}})
                }
            };
            if let Ok(mut bytes) = serde_json::to_vec(&response) {
                bytes.push(b'\n');
                let _ = tokio::time::timeout(Duration::from_secs(5), async {
                    writer.lock().await.write_all(&bytes).await
                })
                .await;
            }
        });
    }
}
async fn eval_raw(window: &WebviewWindow, script: String) -> Result<Value> {
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let sender = Arc::new(Mutex::new(Some(sender)));
    window
        .eval_with_callback(script, move |raw| {
            if let Some(sender) = sender.lock().unwrap().take() {
                let _ = sender.send(raw);
            }
        })
        .map_err(|_| "SMOKE_EVAL_FAILED")?;
    let raw = tokio::time::timeout(Duration::from_secs(5), receiver)
        .await
        .map_err(|_| "SMOKE_EVAL_TIMEOUT")?
        .map_err(|_| "SMOKE_EVAL_FAILED")?;
    if raw.len() > LINE_LIMIT {
        return fail("SMOKE_EVAL_LIMIT");
    }
    Ok(serde_json::from_str(&raw)?)
}
async fn evaluate(window: &WebviewWindow, script: &str) -> Result<Value> {
    if script.len() > 1024 * 1024 {
        return fail("SMOKE_EVAL_LIMIT");
    }
    let id = serde_json::to_string(&uuid::Uuid::new_v4().to_string())?;
    eval_raw(window,format!("(()=>{{const id={id};window.__raypxSmokeResults??={{}};(async()=>{{{script}}})().then(value=>window.__raypxSmokeResults[id]={{ok:true,value:value??null}},()=>window.__raypxSmokeResults[id]={{ok:false}});return true}})()" )).await?;
    loop {
        let value=eval_raw(window,format!("(()=>{{const id={id},v=window.__raypxSmokeResults?.[id];if(v)delete window.__raypxSmokeResults[id];return v??null}})()" )).await?;
        if !value.is_null() {
            if value["ok"] != true {
                return fail("SMOKE_SCRIPT_FAILED");
            }
            return Ok(value["value"].clone());
        }
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
}
impl Driver {
    async fn dispatch(&self, method: &str, input: Value) -> Result<Value> {
        match method {
            "eval" => {
                evaluate(
                    &self.window,
                    input["script"].as_str().ok_or("INVALID_SMOKE_REQUEST")?,
                )
                .await
            }
            "engineRequest" => {
                self.host
                    .engine
                    .request(
                        input["method"].as_str().ok_or("INVALID_SMOKE_REQUEST")?,
                        input["params"].clone(),
                    )
                    .await
            }
            "apiRequest" => self.host.api.request(input, false).await,
            "engineReplace" => Ok(json!(self.host.engine.start(true).await?)),
            "engineStop" => {
                self.host.engine.stop().await;
                Ok(json!(true))
            }
            "refreshGrant" => Ok(json!(self.host.refresh_grant().await?)),
            "window" => {
                match input["action"].as_str() {
                    Some("close") => self.window.close().map_err(|_| "WINDOW_UNAVAILABLE")?,
                    Some("resize") => {
                        let width = input["width"]
                            .as_f64()
                            .filter(|v| *v >= 1. && *v <= 16384.)
                            .ok_or("INVALID_WINDOW_SIZE")?;
                        let height = input["height"]
                            .as_f64()
                            .filter(|v| *v >= 1. && *v <= 16384.)
                            .ok_or("INVALID_WINDOW_SIZE")?;
                        self.window
                            .set_size(tauri::LogicalSize::new(width, height))
                            .map_err(|_| "WINDOW_UNAVAILABLE")?;
                    }
                    None => {}
                    _ => return fail("INVALID_WINDOW_ACTION"),
                }
                let size = self.window.inner_size().map_err(|_| "WINDOW_UNAVAILABLE")?;
                let scale = self.window.scale_factor().unwrap_or(1.);
                let focuses = self.focuses.load(Ordering::SeqCst);
                let bounds = self
                    .app
                    .tray_by_id("main")
                    .and_then(|tray| tray.rect().ok().flatten());
                Ok(
                    json!({"visible":self.window.is_visible().unwrap_or(false),"focused":self.window.is_focused().unwrap_or(false),"focuses":focuses,"activations":focuses,"minimized":self.window.is_minimized().unwrap_or(false),"width":size.width as f64/scale,"height":size.height as f64/scale,"trayVisible":self.host.tray.load(Ordering::SeqCst),"trayBounds":{"width":bounds.as_ref().map(|r|r.size.to_physical::<u32>(scale).width).unwrap_or(0),"height":bounds.as_ref().map(|r|r.size.to_physical::<u32>(scale).height).unwrap_or(0)}}),
                )
            }
            "tray" => {
                match input["action"].as_str() {
                    Some("show") => {
                        crate::shell::show(&self.app);
                        self.host.visible(true).await;
                    }
                    Some("hide") => {
                        self.window.hide().map_err(|_| "WINDOW_UNAVAILABLE")?;
                        self.host.visible(false).await;
                    }
                    Some("pending") => {
                        crate::shell::show(&self.app);
                        self.host.events.send(json!({"version":1,"event":"approval.open","data":{"scope":"local"}}),&self.host.cancelled()).await?;
                    }
                    Some("quit") => {
                        let app = self.app.clone();
                        tokio::spawn(async move {
                            tokio::time::sleep(Duration::from_millis(50)).await;
                            app.exit(0);
                        });
                    }
                    _ => return fail("INVALID_TRAY_ACTION"),
                }
                Ok(json!(true))
            }
            "cors" => self.cors(input).await,
            "stream" => self.stream().await,
            _ => fail("UNKNOWN_SMOKE_METHOD"),
        }
    }
    async fn stream(&self) -> Result<Value> {
        let id = uuid::Uuid::new_v4().to_string();
        evaluate(&self.window,&format!("const stats=window.__raypxSmokeStreamStats={{id:{},count:0,bytes:0,ordered:true,intact:true}};const listener=e=>{{const d=e.detail.event?.data;if(d?.nativeSmokeStream!==stats.id)return;const bytes=atob(d.data);stats.ordered&&=d.streamIndex===stats.count;stats.intact&&=bytes==='x'.repeat(d.rawBytes);stats.count++;stats.bytes+=bytes.length;}};window.addEventListener('raypx-smoke-local-event',listener);window.__raypxSmokeStreamRestore=()=>window.removeEventListener('raypx-smoke-local-event',listener);return true",serde_json::to_string(&id)?)).await?;
        let started = std::time::Instant::now();
        let data = STANDARD.encode(vec![b'x'; 32768]);
        let cancel = self.host.cancelled();
        for index in 0..640 {
            self.host.events.send(json!({"version":1,"event":"terminal.output","data":{"terminalId":"native-smoke-stream","data":data,"nativeSmokeStream":id,"streamIndex":index,"rawBytes":32768}}),&cancel).await?;
            tokio::time::sleep(Duration::from_millis(3)).await;
        }
        self.host.events.flush(&cancel).await?;
        let elapsed = started.elapsed();
        let renderer = evaluate(
            &self.window,
            "window.__raypxSmokeStreamRestore?.();return window.__raypxSmokeStreamStats",
        )
        .await?;
        let (outstanding, maximum) = self.host.events.metrics();
        Ok(
            json!({"renderer":renderer,"packets":640,"bytes":640*32768,"elapsedMs":elapsed.as_millis(),"bytesPerSecond":(640.*32768.)/elapsed.as_secs_f64(),"outstandingBytes":outstanding,"maxOutstandingBytes":maximum,"creditBytes":1024*1024}),
        )
    }
    async fn cors(&self, input: Value) -> Result<Value> {
        let origin = |name: &str| -> Result<String> {
            let origin = crate::config::origin(input[name].as_str().ok_or("INVALID_CORS_ORIGIN")?)?;
            let url = url::Url::parse(&origin)?;
            if url.scheme() != "http"
                || !matches!(
                    url.host_str(),
                    Some("localhost" | "127.0.0.1" | "[::1]" | "::1")
                )
                || url.port() == Some(0)
            {
                return fail("INVALID_CORS_ORIGIN");
            }
            Ok(origin)
        };
        let a = origin("originA")?;
        let b = origin("originB")?;
        if a == b {
            return fail("INVALID_CORS_ORIGIN");
        }
        let app = self.app.clone();
        let target = a.clone();
        let (send, receive) = tokio::sync::oneshot::channel();
        self.app
            .run_on_main_thread(move || {
                let navigation = target.clone();
                let result = tauri::WebviewWindowBuilder::new(
                    &app,
                    "cors",
                    tauri::WebviewUrl::External(
                        format!("{target}/__raypx_cors/page").parse().unwrap(),
                    ),
                )
                .visible(false)
                .focused(false)
                .on_navigation(move |url| url.origin().ascii_serialization() == navigation)
                .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
                .build();
                let _ = send.send(result);
            })
            .map_err(|_| "CORS_WINDOW_FAILED")?;
        let window = receive
            .await
            .map_err(|_| "CORS_WINDOW_FAILED")?
            .map_err(|_| "CORS_WINDOW_FAILED")?;
        let result=async {
            for _ in 0..200 {if eval_raw(&window,"document.readyState === 'complete' && location.pathname === '/__raypx_cors/page'".into()).await.unwrap_or(Value::Null)==true {break;}tokio::time::sleep(Duration::from_millis(25)).await;}
            evaluate(&window,&format!("const read=async url=>{{const r=await fetch(url,{{cache:'no-store',credentials:'omit'}});if(!r.ok)throw Error();return r.text()}};const same=await read({a:?}+'/__raypx_cors/same'),allowed=await read({b:?}+'/__raypx_cors/allowed');let blocked=false;try{{await read({b:?}+'/__raypx_cors/denied')}}catch{{blocked=true}}return {{sameOrigin:same==='same-origin',allowedCors:allowed==='allowed-cors',blockedCors:blocked,origin:location.origin,cspMeta:!!document.querySelector('meta[http-equiv=\"Content-Security-Policy\"]'),error:null}}" )).await
        }.await;
        let _ = window.destroy();
        result
    }
}
