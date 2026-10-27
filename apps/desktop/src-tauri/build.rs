use std::{env, fs, path::PathBuf};

const COMMANDS: &[&str] = &[
    "open_external",
    "api_fetch",
    "api_cancel",
    "control_info",
    "terminal_settings",
    "terminal_configure",
    "control_session",
    "control_enable",
    "control_revoked",
    "control_attach",
    "control_detach",
    "get_runtime",
    "hide_window",
    "pick_directory",
    "local_request",
    "restart_engine",
    "get_analytics_preferences",
    "save_analytics_preferences",
    "save_preferences",
    "subscribe_local_events",
    "ack_local_events",
];

fn main() {
    let root = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let permissions = format!(
        "[[permission]]\nidentifier = \"allow-desktop\"\ndescription = \"Raypx main window native bridge\"\ncommands.allow = [{}]\n",
        COMMANDS
            .iter()
            .map(|name| format!("{name:?}"))
            .collect::<Vec<_>>()
            .join(", ")
    );
    let permission_file = root.join("permissions/desktop.toml");
    fs::create_dir_all(root.join("permissions")).expect("create command permission directory");
    if fs::read_to_string(&permission_file).ok().as_deref() != Some(&permissions) {
        fs::write(permission_file, permissions).expect("write command permissions");
    }
    println!("cargo:rerun-if-changed=generated/desktop-methods.json");
    println!("cargo:rerun-if-changed=generated/notifications.json");
    println!(
        "cargo:rustc-env=RAYPX_TARGET_TRIPLE={}",
        env::var("TARGET").unwrap()
    );
    println!("cargo:rerun-if-env-changed=RAYPX_UPDATER_PUBLIC_KEY");
    println!("cargo:rerun-if-env-changed=RAYPX_UPDATER_ENDPOINT");
    tauri_build::try_build(
        tauri_build::Attributes::new()
            .app_manifest(tauri_build::AppManifest::new().commands(COMMANDS)),
    )
    .expect("build desktop manifest");
}
