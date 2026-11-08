fn main() {
    #[cfg(feature = "gui")]
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "desktop_request",
            "desktop_subscribe",
            "desktop_unsubscribe",
            "desktop_acknowledge",
        ]),
    ))
    .expect("Tauri configuration must be valid");
}
