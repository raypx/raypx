pub mod api;
pub mod config;
pub mod connectors;
pub mod control;
pub mod cookies;
pub mod engine;
pub mod external;
pub mod lease;
pub mod local_request;
pub mod lock;
pub mod notifications;
pub mod orpc_client;
pub mod prefs;
#[cfg(feature = "native-smoke")]
pub mod smoke;
#[cfg(feature = "native-smoke")]
pub mod smoke_cors;
mod update;

use crate::{
    api::Api,
    control::Control,
    engine::{Engine, EventStream},
    lease::Lease,
};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    time::Duration,
};
use tauri::{
    Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    ipc::Channel,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;

macro_rules! desktop_commands {
    ($consumer:ident) => { $consumer! { open_external, api_fetch, api_cancel, control_info, terminal_settings, terminal_configure, control_session, control_enable, control_revoked, control_attach, control_detach, get_runtime, hide_window, pick_directory, local_request, restart_engine, get_analytics_preferences, save_analytics_preferences, save_preferences, subscribe_local_events, ack_local_events } };
}
macro_rules! command_names { ($($command:ident),*) => { &[$(stringify!($command)),*] }; }
macro_rules! command_handler { ($($command:ident),*) => { tauri::generate_handler![$($command),*] }; }
pub const DESKTOP_COMMANDS: &[&str] = desktop_commands!(command_names);

pub struct Desktop {
    pub engine: Arc<Engine>,
    pub api: Arc<Api>,
    pub control: Control,
    pub lease: Lease,
    pub events: Arc<EventStream>,
    pub preferences: Mutex<prefs::PreferenceStore>,
    pub scope: String,
    pub directories: Value,
    pub quitting: AtomicBool,
    pub page_ready: AtomicBool,
    pub tray: AtomicBool,
    pub pending_scope: Mutex<Option<&'static str>>,
    pub instance: Mutex<Option<lock::InstanceLock>>,
    #[cfg(feature = "native-smoke")]
    pub api_trace: Mutex<Vec<Value>>,
}
pub async fn request_api(state: &Desktop, input: Value) -> Result<Value, String> {
    #[cfg(feature = "native-smoke")]
    let trace = json!({"path":input["path"],"method":input["method"]});
    let result = state.api.request(input).await;
    #[cfg(feature = "native-smoke")]
    {
        let mut history = state.api_trace.lock().unwrap();
        if history.len() == 1000 {
            history.remove(0);
        }
        let mut trace = trace;
        trace["status"] = result
            .as_ref()
            .map(|value| value["status"].clone())
            .unwrap_or(Value::Null);
        history.push(trace);
    }
    result
}
fn trusted(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("Untrusted desktop view".into());
    }
    let url = window.url().map_err(|_| "Untrusted desktop view")?;
    let own =
        url.scheme() == "tauri" && url.host_str() == Some("localhost") && url.port().is_none()
            || url.scheme() == "http"
                && url.host_str() == Some("tauri.localhost")
                && url.port().is_none();
    let dev = tauri::is_dev() && url.origin().ascii_serialization() == "http://localhost:1420";
    if own || dev {
        Ok(())
    } else {
        Err("Untrusted desktop view".into())
    }
}
pub fn runtime(state: &Desktop) -> Value {
    json!({"appVersion":env!("CARGO_PKG_VERSION"),"platform":if cfg!(target_os="macos"){"darwin"}else if cfg!(windows){"win32"}else{std::env::consts::OS},"trayEnabled":state.tray.load(Ordering::SeqCst),"engine":state.engine.status(),"features":state.engine.features(),"compiledFeatures":if cfg!(feature="native-smoke"){vec!["native-smoke"]}else{vec![]}})
}
#[tauri::command]
async fn open_external(window: WebviewWindow, input: Value) -> Result<bool, String> {
    trusted(&window)?;
    let Some(url) = input["url"].as_str().and_then(external::external_url) else {
        return Ok(false);
    };
    window
        .opener()
        .open_url(url, None::<&str>)
        .map(|_| true)
        .map_err(|_| "Unable to open external URL".into())
}
#[tauri::command]
async fn api_fetch(
    window: WebviewWindow,
    state: State<'_, Arc<Desktop>>,
    input: Value,
) -> Result<Value, String> {
    trusted(&window)?;
    request_api(&state, input).await
}
#[tauri::command]
fn api_cancel(
    window: WebviewWindow,
    state: State<'_, Arc<Desktop>>,
    input: Value,
) -> Result<bool, String> {
    trusted(&window)?;
    Ok(input["id"].as_str().is_some_and(|id| state.api.cancel(id)))
}
#[tauri::command]
async fn control_session(
    window: WebviewWindow,
    state: State<'_, Arc<Desktop>>,
    input: Value,
) -> Result<bool, String> {
    trusted(&window)?;
    let account = if input["accountId"].is_null() {
        None
    } else {
        Some(
            input["accountId"]
                .as_str()
                .ok_or("AUTH_REQUIRED")?
                .to_owned(),
        )
    };
    state.control.session(account).await
}
macro_rules! control_command {
    ($name:ident,$method:literal) => {
        #[tauri::command]
        async fn $name(
            window: WebviewWindow,
            state: State<'_, Arc<Desktop>>,
            input: Value,
        ) -> Result<Value, String> {
            trusted(&window)?;
            state.control.request($method, input).await
        }
    };
}
control_command!(control_info, "host.info");
control_command!(control_enable, "host.enable");
control_command!(control_revoked, "host.revoked");
control_command!(terminal_settings, "host.terminal.settings");
control_command!(terminal_configure, "host.terminal.configure");
#[tauri::command]
async fn control_attach(
    window: WebviewWindow,
    state: State<'_, Arc<Desktop>>,
    input: Value,
) -> Result<Value, String> {
    trusted(&window)?;
    state.control.attach(input).await
}
#[tauri::command]
async fn control_detach(
    window: WebviewWindow,
    state: State<'_, Arc<Desktop>>,
) -> Result<bool, String> {
    trusted(&window)?;
    state.control.detach().await
}
#[tauri::command]
fn get_runtime(window: WebviewWindow, state: State<'_, Arc<Desktop>>) -> Result<Value, String> {
    trusted(&window)?;
    Ok(runtime(&state))
}
#[tauri::command]
async fn hide_window(
    window: WebviewWindow,
    state: State<'_, Arc<Desktop>>,
) -> Result<bool, String> {
    trusted(&window)?;
    if !state.tray.load(Ordering::SeqCst) {
        return Ok(false);
    }
    window.hide().map_err(|_| "Unable to hide window")?;
    state.lease.update(&window).await;
    Ok(!window.is_visible().unwrap_or(true))
}
#[tauri::command]
async fn pick_directory(
    window: WebviewWindow,
    state: State<'_, Arc<Desktop>>,
) -> Result<Value, String> {
    trusted(&window)?;
    let (tx, rx) = tokio::sync::oneshot::channel();
    window.dialog().file().pick_folder(move |path| {
        let _ = tx.send(path);
    });
    let path = rx.await.map_err(|_| "Directory picker unavailable")?;
    match path {
        None => Ok(Value::Null),
        Some(path) => {
            let path = path
                .into_path()
                .map_err(|_| "Invalid directory selection")?;
            state
                .engine
                .request("roots.register", json!({"path":path}))
                .await
        }
    }
}
#[tauri::command]
async fn local_request(
    window: WebviewWindow,
    state: State<'_, Arc<Desktop>>,
    input: Value,
) -> Result<Value, String> {
    trusted(&window)?;
    let method = input["method"].as_str().ok_or("Invalid local method")?;
    local_request::assert_renderer_method(method)?;
    if method == "connectors.install" && input["params"]["recoverModified"] == true {
        return connectors::repair(
            &state.engine.binary,
            &state.engine.args,
            &input["params"],
            &state.directories,
        )
        .await;
    }
    let params =
        local_request::renderer_params(method, &input["params"], &state.directories, &state.scope)?;
    state.engine.request(method, params).await
}
#[tauri::command]
async fn restart_engine(
    window: WebviewWindow,
    state: State<'_, Arc<Desktop>>,
    input: Value,
) -> Result<bool, String> {
    trusted(&window)?;
    let started = if input["replaceOwner"] == true {
        state.engine.replace_owner().await
    } else {
        state.engine.start().await
    };
    state.lease.update(&window).await;
    Ok(started)
}
#[tauri::command]
fn get_analytics_preferences(
    window: WebviewWindow,
    state: State<'_, Arc<Desktop>>,
) -> Result<Value, String> {
    trusted(&window)?;
    let analytics = state.preferences.lock().unwrap().read()["analytics"].clone();
    Ok(analytics)
}
#[tauri::command]
fn save_analytics_preferences(
    window: WebviewWindow,
    state: State<'_, Arc<Desktop>>,
    input: Value,
) -> Result<bool, String> {
    trusted(&window)?;
    Ok(state
        .preferences
        .lock()
        .unwrap()
        .save(json!({"analytics":input})))
}
#[tauri::command]
fn save_preferences(
    window: WebviewWindow,
    state: State<'_, Arc<Desktop>>,
    input: Value,
) -> Result<bool, String> {
    trusted(&window)?;
    Ok(state.preferences.lock().unwrap().save(input))
}
#[tauri::command]
fn subscribe_local_events(
    window: WebviewWindow,
    state: State<'_, Arc<Desktop>>,
    channel: Channel<Value>,
) -> Result<bool, String> {
    trusted(&window)?;
    state.events.subscribe(channel);
    Ok(true)
}
#[tauri::command]
fn ack_local_events(
    window: WebviewWindow,
    state: State<'_, Arc<Desktop>>,
    input: Value,
) -> Result<bool, String> {
    trusted(&window)?;
    Ok(input["sequence"]
        .as_u64()
        .is_some_and(|sequence| state.events.acknowledge(sequence)))
}

pub fn show(window: &WebviewWindow) {
    let _ = window.unminimize();
    let _ = window.show();
    if interactive() {
        let _ = window.set_focus();
    }
    refresh_approval_lease(window);
}
fn refresh_approval_lease(window: &WebviewWindow) {
    let state = window.state::<Arc<Desktop>>().inner().clone();
    let window = window.clone();
    tauri::async_runtime::spawn(async move {
        state.lease.update(&window).await;
    });
}
fn interactive() -> bool {
    !cfg!(feature = "native-smoke")
        || std::env::var("RAYPX_NATIVE_SMOKE_UI").as_deref() == Ok("interactive")
}
pub fn tray_action(window: &WebviewWindow, action: &str) {
    let state = window.state::<Arc<Desktop>>();
    match action {
        "show" => show(window),
        "hide" => {
            let _ = window.hide();
            refresh_approval_lease(window);
        }
        "pending" => {
            show(window);
            let scope = state.pending_scope.lock().unwrap().unwrap_or("local");
            let events = state.events.clone();
            tauri::async_runtime::spawn(async move {
                let _ = events
                    .send(
                        json!({"version":1,"event":"approval.open","data":{"scope":scope}}),
                        &tokio_util::sync::CancellationToken::new(),
                    )
                    .await;
            });
        }
        "update" => update::check(window.app_handle().clone()),
        "quit" => shutdown(window.app_handle().clone()),
        _ => {}
    }
}
pub fn shutdown(app: tauri::AppHandle) {
    shutdown_with_code(app, 0);
}
pub fn shutdown_with_code(app: tauri::AppHandle, code: i32) {
    let Some(state) = app.try_state::<Arc<Desktop>>() else {
        app.exit(code);
        return;
    };
    if state.quitting.swap(true, Ordering::SeqCst) {
        return;
    }
    let state = state.inner().clone();
    tauri::async_runtime::spawn(async move {
        prepare_exit(&app, &state).await;
        app.exit(code);
    });
}
pub async fn prepare_exit(app: &tauri::AppHandle, state: &Desktop) {
    let _ = tokio::time::timeout(Duration::from_secs(2), state.lease.stop()).await;
    if !state.engine.daemon {
        let _ = tokio::time::timeout(Duration::from_secs(2), state.control.detach()).await;
    }
    state.engine.stop().await;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
        let (tx, rx) = tokio::sync::oneshot::channel();
        let tx = Mutex::new(Some(tx));
        let _ =
            window.eval_with_callback("window.location.replace('about:blank');null", move |_| {
                if let Some(tx) = tx.lock().unwrap().take() {
                    let _ = tx.send(());
                }
            });
        let _ = tokio::time::timeout(Duration::from_secs(2), rx).await;
    }
    state.instance.lock().unwrap().take();
}
fn cli_binary() -> Result<PathBuf, String> {
    let binary = std::env::current_exe()
        .map_err(|_| "Unable to locate Desktop executable")?
        .parent()
        .ok_or("Unable to locate Desktop directory")?
        .join(if cfg!(windows) { "raypx.exe" } else { "raypx" });
    if binary.is_file() || !tauri::is_dev() {
        return Ok(binary);
    }
    let target = env!("RAYPX_TARGET_TRIPLE");
    Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(format!(
            "raypx-{target}{}",
            if cfg!(windows) { ".exe" } else { "" }
        )))
}
fn navigation_allowed(url: &url::Url) -> bool {
    url.scheme() == "tauri" && url.host_str() == Some("localhost") && url.port().is_none()
        || url.scheme() == "http"
            && url.host_str() == Some("tauri.localhost")
            && url.port().is_none()
        || tauri::is_dev() && url.origin().ascii_serialization() == "http://localhost:1420"
        || url.as_str() == "about:blank"
}
fn setup(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let smoke = cfg!(feature = "native-smoke")
        .then(|| std::env::var_os("RAYPX_NATIVE_SMOKE_DATA_DIR"))
        .flatten()
        .map(PathBuf::from);
    let directory = match &smoke {
        Some(directory) => directory.clone(),
        None => app.path().app_local_data_dir()?.join("stable"),
    };
    let instance = lock::acquire(&directory)?.ok_or("Desktop instance already running")?;
    let config = config::load(smoke.as_ref().map(|directory| directory.join("config")))?;
    let preferences = prefs::PreferenceStore::new(directory.clone());
    let api = Arc::new(tauri::async_runtime::block_on(Api::new(
        config.api_url.clone(),
        directory.join("servers").join(&config.scope),
    ))?);
    let events = Arc::new(EventStream::default());
    let args = smoke
        .map(|directory| {
            vec![
                "--profile".into(),
                "native-smoke".into(),
                "--data-dir".into(),
                directory.to_string_lossy().into_owned(),
            ]
        })
        .unwrap_or_default();
    let engine = Engine::new(
        cli_binary()?,
        env!("CARGO_PKG_VERSION").into(),
        args,
        cfg!(any(target_os = "macos", windows)),
        events.clone(),
    );
    let mut directories = config.connector_directories;
    if let Some(dirs) = directories.as_object_mut() {
        for (key, env) in [("claude", "CLAUDE_CONFIG_DIR"), ("codex", "CODEX_HOME")] {
            if !dirs.contains_key(key)
                && let Ok(path) = std::env::var(env)
            {
                dirs.insert(key.to_owned(), json!(path));
            }
        }
    }
    let preload = format!(
        "{}Object.defineProperty(window,'__raypxTerminalHooks',{{value:{}}});{}",
        config.preload,
        // Terminal hooks belong to the independent daemon (macOS and Windows).
        engine.daemon,
        preferences.preload()
    );
    let state = Arc::new(Desktop {
        control: Control::new(engine.clone(), api.clone(), config.api_url),
        lease: Lease::new(engine.clone()),
        engine: engine.clone(),
        api,
        events,
        preferences: Mutex::new(preferences),
        scope: config.scope,
        directories,
        quitting: AtomicBool::new(false),
        page_ready: AtomicBool::new(false),
        tray: AtomicBool::new(false),
        pending_scope: Mutex::new(None),
        instance: Mutex::new(Some(instance)),
        #[cfg(feature = "native-smoke")]
        api_trace: Mutex::new(Vec::new()),
    });
    app.manage(state.clone());
    if let Some(recovery) = state.api.recovery
        && interactive()
    {
        app.dialog().message(if recovery == "reset" { "Session storage was reset. Sign in again. / 登录存储已重置，请重新登录。" } else { "Secure storage is unavailable. This login will not survive a restart. / 安全存储不可用，本次登录不会保存。" }).title("Raypx").show(|_| {});
    }
    let observer_state = Arc::downgrade(&state);
    let observer_app = app.handle().clone();
    state.events.observe(Arc::new(move |event| {
        if !["agent.changed", "observed.changed"].contains(&event["event"].as_str().unwrap_or(""))
            || !event["data"]["pendingRequest"].is_string()
        {
            return;
        }
        let Some(state) = observer_state.upgrade() else {
            return;
        };
        *state.pending_scope.lock().unwrap() = Some(
            if event["event"] == "observed.changed" || event["data"]["local"] == true {
                "local"
            } else {
                "remote"
            },
        );
        if interactive() {
            let notifications: Value =
                serde_json::from_str(include_str!("../generated/notifications.json"))
                    .expect("generated notification messages");
            let preference = state.preferences.lock().unwrap().read();
            let locale = preference["locale"].as_str();
            let system_locale = matches!(locale, None | Some("" | "system"))
                .then(notifications::system_locale)
                .flatten();
            let language = notifications::language(locale, system_locale.as_deref());
            if let Some(body) = notifications[language].as_str() {
                let _ = observer_app
                    .notification()
                    .builder()
                    .title("Raypx")
                    .body(body)
                    .show();
            }
        }
    }));
    let window = WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
        .title("Raypx")
        .inner_size(1120.0, 720.0)
        .min_inner_size(800.0, 620.0)
        .visible(false)
        .focused(interactive())
        .focusable(interactive())
        .initialization_script(preload)
        .on_navigation(navigation_allowed)
        .on_page_load(|window, payload| {
            let state = window.state::<Arc<Desktop>>();
            state.page_ready.store(
                matches!(payload.event(), tauri::webview::PageLoadEvent::Finished),
                Ordering::SeqCst,
            );
        })
        .build()?;
    let show_item = MenuItem::with_id(app, "show", "Show Raypx", true, None::<&str>)?;
    let pending = MenuItem::with_id(
        app,
        "pending",
        "Review requests / 处理请求",
        true,
        None::<&str>,
    )?;
    let hide = MenuItem::with_id(app, "hide", "Hide window", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Raypx", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let update = MenuItem::with_id(
        app,
        "update",
        "Check for updates / 检查更新",
        update::configured(),
        None::<&str>,
    )?;
    let menu = Menu::with_items(
        app,
        &[&show_item, &pending, &hide, &separator, &update, &quit],
    )?;
    let mut tray = TrayIconBuilder::with_id("main")
        .menu(&menu)
        .on_menu_event(|app, event| {
            if let Some(window) = app.get_webview_window("main") {
                tray_action(&window, event.id().as_ref());
            }
        });
    tray = tray.icon(tauri::image::Image::from_bytes(include_bytes!(
        "../icons/tray.png"
    ))?);
    let _tray = tray.build(app)?;
    state.tray.store(true, Ordering::SeqCst);
    let event_window = window.clone();
    let event_state = state.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event
            && event_state.tray.load(Ordering::SeqCst)
            && !event_state.quitting.load(Ordering::SeqCst)
        {
            api.prevent_close();
            let _ = event_window.hide();
        }
        let state = event_state.clone();
        let window = event_window.clone();
        tauri::async_runtime::spawn(async move {
            state.lease.update(&window).await;
        });
    });
    let lease_window = window.clone();
    let lease_state = state.clone();
    tauri::async_runtime::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(5));
        loop {
            interval.tick().await;
            if lease_state.quitting.load(Ordering::SeqCst) {
                break;
            }
            lease_state.lease.update(&lease_window).await;
        }
    });
    let ready_state = state.clone();
    let ready_window = window.clone();
    tauri::async_runtime::spawn(async move {
        engine.start().await;
        ready_state.lease.update(&ready_window).await;
    });
    let signal_app = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        if tokio::signal::ctrl_c().await.is_ok() {
            shutdown(signal_app);
        }
    });
    #[cfg(unix)]
    {
        let signal_app = app.handle().clone();
        tauri::async_runtime::spawn(async move {
            if let Ok(mut signal) =
                tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
            {
                signal.recv().await;
                shutdown(signal_app);
            }
        });
    }
    #[cfg(feature = "native-smoke")]
    smoke::start(app.handle().clone())?;
    show(&window);
    Ok(())
}
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(setup)
        .invoke_handler(desktop_commands!(command_handler));
    let app = builder
        .build(tauri::generate_context!())
        .expect("Unable to initialize Raypx Desktop");
    app.run(|app, event| match event {
        tauri::RunEvent::ExitRequested { api, .. }
            if app
                .try_state::<Arc<Desktop>>()
                .is_some_and(|state| !state.quitting.load(Ordering::SeqCst)) =>
        {
            api.prevent_exit();
            shutdown(app.clone());
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Reopen { .. } => {
            if let Some(window) = app.get_webview_window("main") {
                let pending = window
                    .state::<Arc<Desktop>>()
                    .pending_scope
                    .lock()
                    .unwrap()
                    .is_some();
                if pending {
                    tray_action(&window, "pending");
                } else {
                    show(&window);
                }
            }
        }
        _ => {}
    });
}
