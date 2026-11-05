use crate::{
    Result,
    config::{Config, data_directory},
    fail,
    host::{Host, external_url, trusted_url},
};
use serde_json::{Value, json};
use std::fmt::Display;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use tauri::{
    Manager, State, WebviewUrl, WebviewWindow, WebviewWindowBuilder,
    ipc::Channel,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_updater::UpdaterExt;
fn caller(window: &WebviewWindow, host: &Host) -> Result<()> {
    if window.label() != "main"
        || !window
            .url()
            .is_ok_and(|url| trusted_url(&url, &host.config.scope))
    {
        return fail("UNTRUSTED_DESKTOP_VIEW");
    }
    Ok(())
}
fn native_smoke_setup_error(stage: &str, error: impl Display) -> crate::Error {
    let message = format!("{stage}: {error}");
    native_smoke_lifecycle(&format!("setup error: {message}"));
    #[cfg(feature = "native-smoke")]
    if let Some(directory) = std::env::var_os("RAYPX_NATIVE_SMOKE_DATA_DIR") {
        let _ = std::fs::write(
            std::path::PathBuf::from(directory).join("native-smoke-startup-error"),
            &message,
        );
    }
    crate::Error(message)
}
fn native_smoke_lifecycle(stage: &str) {
    #[cfg(feature = "native-smoke")]
    {
        eprintln!("[native-smoke] {stage}");
        if let Some(directory) = std::env::var_os("RAYPX_NATIVE_SMOKE_DATA_DIR") {
            use std::io::Write;
            let path = std::path::PathBuf::from(directory).join("native-smoke-lifecycle");
            match std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(path)
            {
                Ok(mut file) => {
                    if let Err(error) = writeln!(file, "{stage}") {
                        eprintln!("[native-smoke] lifecycle write failed: {error}");
                    }
                }
                Err(error) => eprintln!("[native-smoke] lifecycle open failed: {error}"),
            }
        } else {
            eprintln!("[native-smoke] data directory environment is missing");
        }
    }
    #[cfg(not(feature = "native-smoke"))]
    let _ = stage;
}
#[tauri::command]
async fn desktop_request(
    window: WebviewWindow,
    host: State<'_, Arc<Host>>,
    method: String,
    input: Value,
) -> std::result::Result<Value, String> {
    let result: Result<Value> = async {
        caller(&window, &host)?;
        match method.as_str() {
            "open_external" => {
                let url = external_url(input["url"].as_str().ok_or("INVALID_EXTERNAL_URL")?)?;
                window
                    .app_handle()
                    .opener()
                    .open_url(url.as_str(), None::<&str>)
                    .map_err(|_| "EXTERNAL_OPEN_FAILED")?;
                Ok(json!(true))
            }
            "hide_window" => {
                if !host.tray.load(Ordering::SeqCst) {
                    return Ok(json!(false));
                }
                window.hide().map_err(|_| "WINDOW_UNAVAILABLE")?;
                host.visible(false).await;
                Ok(json!(true))
            }
            "pick_directory" => {
                let (sender, receiver) = tokio::sync::oneshot::channel();
                window
                    .dialog()
                    .file()
                    .set_parent(&window)
                    .pick_folder(move |path| {
                        let _ = sender.send(path);
                    });
                let Some(path) = receiver.await.map_err(|_| "PICKER_UNAVAILABLE")? else {
                    return Ok(Value::Null);
                };
                let path = path.into_path().map_err(|_| "INVALID_DIRECTORY")?;
                if !path.is_absolute() || host.cancelled().is_cancelled() {
                    return fail("INVALID_DIRECTORY");
                }
                host.engine
                    .request("roots.register", json!({"path":path}))
                    .await
            }
            _ => host.inner().request(&method, input).await,
        }
    }
    .await;
    result.map_err(|error| error.to_string())
}
#[tauri::command]
fn desktop_subscribe(
    window: WebviewWindow,
    host: State<'_, Arc<Host>>,
    channel: Channel<Value>,
) -> std::result::Result<u64, String> {
    caller(&window, &host).map_err(|e| e.to_string())?;
    host.events
        .subscribe(Arc::new(move |packet| {
            channel
                .send(packet)
                .map_err(|_| "EVENT_CHANNEL_CLOSED".into())
        }))
        .map_err(|e| e.to_string())
}
#[tauri::command]
fn desktop_unsubscribe(
    window: WebviewWindow,
    host: State<'_, Arc<Host>>,
    subscription: u64,
) -> std::result::Result<(), String> {
    caller(&window, &host).map_err(|e| e.to_string())?;
    host.events.unsubscribe(subscription);
    Ok(())
}
#[tauri::command]
fn desktop_acknowledge(
    window: WebviewWindow,
    host: State<'_, Arc<Host>>,
    subscription: u64,
    sequence: u64,
) -> std::result::Result<bool, String> {
    caller(&window, &host).map_err(|e| e.to_string())?;
    Ok(host.events.acknowledge(subscription, sequence))
}
pub(crate) fn show(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        let host = app.state::<Arc<Host>>().inner().clone();
        tauri::async_runtime::spawn(async move {
            host.visible(true).await;
        });
    }
}
async fn update(app: tauri::AppHandle) {
    if cfg!(feature = "native-smoke") {
        return;
    }
    if let Ok(updater) = app.updater()
        && let Ok(Some(update)) = updater.check().await
    {
        let (sender, receiver) = tokio::sync::oneshot::channel();
        app.dialog()
            .message(format!(
                "Install Raypx {} and restart? / 安装更新并重新启动？",
                update.version
            ))
            .title("Raypx")
            .buttons(tauri_plugin_dialog::MessageDialogButtons::OkCancel)
            .show(move |answer| {
                let _ = sender.send(answer);
            });
        if receiver.await.unwrap_or(false) {
            match update.download_and_install(|_, _| {}, || {}).await {
                Ok(()) => {
                    let host = app.state::<Arc<Host>>().inner().clone();
                    host.close().await;
                    app.restart();
                }
                Err(_) => {
                    app.dialog()
                        .message("Update failed. Please try again. / 更新失败，请重试。")
                        .title("Raypx")
                        .show(|_| {});
                }
            }
        }
    }
}
pub fn run() {
    #[cfg(feature = "native-smoke")]
    std::panic::set_hook(Box::new(|panic| {
        if let Some(directory) = std::env::var_os("RAYPX_NATIVE_SMOKE_DATA_DIR") {
            let _ = std::fs::write(
                std::path::PathBuf::from(directory).join("native-smoke-startup-error"),
                format!("panic: {panic}"),
            );
        }
    }));
    native_smoke_lifecycle("entry");
    // Kept in executable output so release probes identify the actual native host.
    if std::env::args().any(|arg| arg == "--host-version") {
        println!("raypx-tauri/2.12.5");
        return;
    }
    let config = match Config::load() {
        Ok(config) => config,
        Err(error) => {
            eprintln!("Unable to load Raypx configuration / 无法读取 Raypx 配置");
            #[cfg(feature = "native-smoke")]
            if let Some(directory) = std::env::var_os("RAYPX_NATIVE_SMOKE_DATA_DIR") {
                let _ = std::fs::write(
                    std::path::PathBuf::from(directory).join("native-smoke-startup-error"),
                    error.to_string(),
                );
            }
            return;
        }
    };
    native_smoke_lifecycle("configuration loaded");
    let scheme = format!("raypx-{}", config.scope);
    let protocol = scheme.clone();
    let quitting = Arc::new(AtomicBool::new(false));
    let exit_flag = quitting.clone();
    let application = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init()).plugin(tauri_plugin_notification::init()).plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![desktop_request,desktop_subscribe,desktop_unsubscribe,desktop_acknowledge])
        .register_uri_scheme_protocol(scheme.clone(),move |context, request| {
            let uri = request.uri();
            // This protocol serves embedded assets only; it never reads user files.
            let path = uri.path().trim_start_matches('/');
            let path = if path.is_empty() {"index.html"} else {path};
            if uri.scheme_str() != Some(protocol.as_str()) || uri.host() != Some("localhost") { return tauri::http::Response::builder().status(403).body(Vec::new()).unwrap(); }
            match context.app_handle().asset_resolver().get(path.into()) {
                Some(asset) => { let mut response = tauri::http::Response::builder().header("content-type",asset.mime_type); if let Some(csp) = asset.csp_header { response = response.header("Content-Security-Policy",csp); } response.body(asset.bytes).unwrap() },
                None => tauri::http::Response::builder().status(404).body(Vec::new()).unwrap(),
            }
        })
        .setup(move |app| {
            native_smoke_lifecycle("setup started");
            let directory = data_directory().map_err(|error| native_smoke_setup_error("data directory", error))?;
            let binary = app.path().resource_dir().map_err(|error| native_smoke_setup_error("resource directory", error))?.join("bin").join(if cfg!(windows) {"raypx.exe"} else {"raypx"});
            let host = Host::open(config,directory,binary).map_err(|error| native_smoke_setup_error("host", error))?; app.manage(host.clone());
            native_smoke_lifecycle("host opened");
            let scope = host.config.scope.clone();
            let url = if cfg!(debug_assertions) { WebviewUrl::External("http://localhost:1420".parse().map_err(|error| native_smoke_setup_error("dev URL", error))?) } else { WebviewUrl::CustomProtocol(format!("{scheme}://localhost/").parse().map_err(|error| native_smoke_setup_error("custom URL", error))?) };
            let window = WebviewWindowBuilder::new(app,"main",url).title(if cfg!(feature="native-smoke") {"Raypx Test"} else {"Raypx"}).inner_size(1280.,840.).min_inner_size(960.,600.)
                .focused(!cfg!(feature="native-smoke") || std::env::var("RAYPX_NATIVE_SMOKE_UI").as_deref()==Ok("interactive"))
                .initialization_script(host.preload()).data_directory(host.directory.join("webview").join(&scope))
                .on_navigation(move |url| trusted_url(url,&scope)).on_new_window(|_,_| tauri::webview::NewWindowResponse::Deny).build().map_err(|error| native_smoke_setup_error("window", error))?;
            native_smoke_lifecycle("window built");
            let host_events = host.clone(); let owned_window = window.clone();
            window.on_window_event(move |event| {
                match event {
                    tauri::WindowEvent::CloseRequested { api,.. } if host_events.tray.load(Ordering::SeqCst) => { api.prevent_close(); let _ = owned_window.hide(); },
                    _ => {},
                }
                let visible = owned_window.is_visible().unwrap_or(false) && !owned_window.is_minimized().unwrap_or(true);
                let host = host_events.clone(); tauri::async_runtime::spawn(async move { host.visible(visible).await; });
            });
            #[cfg(feature="native-smoke")]
            crate::smoke::start(app.handle().clone(),window.clone(),host.clone()).map_err(|error| native_smoke_setup_error("smoke IPC", error))?;
            native_smoke_lifecycle("smoke IPC started");
            let show_item = MenuItem::with_id(app,"show","Show Raypx / 显示",true,None::<&str>).map_err(|error| native_smoke_setup_error("tray show item", error))?;
            let review_item = MenuItem::with_id(app,"review","Review requests / 处理请求",true,None::<&str>).map_err(|error| native_smoke_setup_error("tray review item", error))?;
            let hide_item = MenuItem::with_id(app,"hide","Hide window / 隐藏",true,None::<&str>).map_err(|error| native_smoke_setup_error("tray hide item", error))?;
            let update_item = MenuItem::with_id(app,"update","Check for updates / 检查更新",!cfg!(feature="native-smoke"),None::<&str>).map_err(|error| native_smoke_setup_error("tray update item", error))?;
            let quit_item = MenuItem::with_id(app,"quit","Quit Raypx / 退出",true,None::<&str>).map_err(|error| native_smoke_setup_error("tray quit item", error))?;
            let separator = PredefinedMenuItem::separator(app).map_err(|error| native_smoke_setup_error("tray separator", error))?;
            let menu = Menu::with_items(app,&[&show_item,&review_item,&hide_item,&separator,&update_item,&quit_item]).map_err(|error| native_smoke_setup_error("tray menu", error))?;
            let icon = tauri::image::Image::from_bytes(include_bytes!("../../resources/tray.png")).map_err(|error| native_smoke_setup_error("tray icon", error))?;
            if TrayIconBuilder::with_id("main").icon(icon).icon_as_template(true).tooltip("Raypx").menu(&menu)
                .on_menu_event(|app,event| match event.id.as_ref() {
                    "show" => show(app),
                    "review" => { show(app); let host = app.state::<Arc<Host>>().inner().clone(); tauri::async_runtime::spawn(async move { let _ = host.events.send(json!({"version":1,"event":"approval.open","data":{"scope":"local"}}),&host.cancelled()).await; }); },
                    "hide" => { if let Some(window) = app.get_webview_window("main") { let _ = window.hide(); let host = app.state::<Arc<Host>>().inner().clone(); tauri::async_runtime::spawn(async move { host.visible(false).await; }); } },
                    "update" => { let app = app.clone(); tauri::async_runtime::spawn(async move { update(app).await; }); },
                    "quit" => app.exit(0), _ => {},
                }).on_tray_icon_event(|tray,event| { if matches!(event,TrayIconEvent::Click { button:MouseButton::Left,button_state:MouseButtonState::Up,.. }) { show(tray.app_handle()); } }).build(app).is_ok() { host.tray.store(true,Ordering::SeqCst); }
            native_smoke_lifecycle("tray initialized");
            let notify_app=app.handle().clone();
            let notify_host=Arc::downgrade(&host);let pending_scope=Arc::new(std::sync::Mutex::new(String::from("local")));let click_scope=pending_scope.clone();
            let action_app=app.handle().clone();
            let _=app.notification().on_action(move |_| {show(&action_app);let host=action_app.state::<Arc<Host>>().inner().clone();let scope=click_scope.lock().unwrap().clone();tauri::async_runtime::spawn(async move {let _=host.events.send(json!({"version":1,"event":"approval.open","data":{"scope":scope}}),&host.cancelled()).await;});});
            let busy=Arc::new(AtomicBool::new(false));
            host.events.observe(Arc::new(move |event| {
                if !["agent.changed","observed.changed"].contains(&event["event"].as_str().unwrap_or("")) || !event["data"]["pendingRequest"].is_string() {return Ok(());}
                let Some(host)=notify_host.upgrade() else {return Ok(());};if host.cancelled().is_cancelled() || (cfg!(feature="native-smoke") && std::env::var("RAYPX_NATIVE_SMOKE_UI").as_deref()!=Ok("interactive")) {return Ok(());}
                *pending_scope.lock().unwrap()=if event["event"]=="observed.changed" || event["data"]["local"]==true {"local"} else {"remote"}.into();
                if busy.swap(true,Ordering::SeqCst) {return Ok(());}let busy=busy.clone();let app=notify_app.clone();let locale=host.preferences.snapshot()["raw"]["locale"].as_str().unwrap_or("system").to_owned();
                tauri::async_runtime::spawn_blocking(move || {let text:Value=serde_json::from_str(include_str!("../../generated/notifications.json")).unwrap_or_default();let locale=if locale=="system" {std::env::var("LANG").unwrap_or_default()} else {locale};let body=text[if locale.to_lowercase().starts_with("zh") {"zh"} else {"en"}].as_str().unwrap_or("A session needs your answer");let _=app.notification().builder().title("Raypx").body(body).show();busy.store(false,Ordering::SeqCst);});Ok(())
            }));
            tauri::async_runtime::spawn(async move {
                let _ = host.engine.start(false).await;
                let cancelled = host.cancelled();
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
                loop { tokio::select! { _ = cancelled.cancelled() => break, _ = interval.tick() => host.update_lease().await } }
            });
            native_smoke_lifecycle("setup complete");
            Ok(())
        }).build(tauri::generate_context!()).expect("Unable to initialize Raypx Desktop");
    application.run(move |app, event| {
        if cfg!(feature = "native-smoke") {
            match &event {
                tauri::RunEvent::Ready => native_smoke_lifecycle("event loop ready"),
                tauri::RunEvent::ExitRequested { code, .. } => {
                    native_smoke_lifecycle(&format!("exit requested: {code:?}"));
                }
                tauri::RunEvent::Exit => native_smoke_lifecycle("event loop exited"),
                _ => {}
            }
        }
        if let tauri::RunEvent::ExitRequested { api, .. } = &event
            && !exit_flag.swap(true, Ordering::SeqCst)
        {
            api.prevent_exit();
            let host = app.state::<Arc<Host>>().inner().clone();
            let app = app.clone();
            tauri::async_runtime::spawn(async move {
                host.close().await;
                app.exit(0);
            });
        }
        #[cfg(target_os = "macos")]
        if let tauri::RunEvent::Reopen { .. } = event {
            show(app);
        }
    });
}
