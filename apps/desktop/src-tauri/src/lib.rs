mod folder;
mod runner;

use serde::{Deserialize, Serialize};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, RunEvent, WindowEvent,
};

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct DesktopRuntime {
    app_version: String,
    platform: String,
    tray_enabled: bool,
}

fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Show VoidMix", true, None::<&str>)?;
    let hide = MenuItem::with_id(app, "hide", "Hide window", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit VoidMix", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

    let mut tray = TrayIconBuilder::new();
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }

    tray.menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "hide" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

#[tauri::command]
fn desktop_runtime(app: AppHandle) -> DesktopRuntime {
    DesktopRuntime {
        app_version: app.package_info().version.to_string(),
        platform: std::env::consts::OS.to_string(),
        tray_enabled: true,
    }
}

#[tauri::command]
fn hide_main_window(app: AppHandle) -> Result<(), String> {
    app.get_webview_window("main")
        .ok_or_else(|| "Main window is not available".to_owned())?
        .hide()
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(folder::PiState::default())
        .manage(runner::RunnerState::default())
        .setup(|app| {
            build_tray(app)?;
            // A missing runner is an explicit unavailable state, never a simulated run.
            let _ = runner::start(app);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            desktop_runtime,
            hide_main_window,
            folder::authorize_project_folder,
            runner::runner_status,
            runner::runner_configure,
            runner::runner_grant,
            runner::runner_revoke,
            runner::runner_cancel,
            runner::runner_steer,
            runner::runner_approve,
            runner::runner_subscribe
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building VoidMix desktop application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { api, .. } = event {
                let state = app.state::<runner::RunnerState>();
                if !state
                    .quitting
                    .swap(true, std::sync::atomic::Ordering::SeqCst)
                {
                    api.prevent_exit();
                    let handle = app.clone();
                    std::thread::spawn(move || {
                        runner::stop(&handle);
                        handle.exit(0);
                    });
                }
            }
        });
}
