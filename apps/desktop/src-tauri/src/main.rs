#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    #[cfg(feature = "native-smoke")]
    if let Some(directory) = std::env::var_os("RAYPX_NATIVE_SMOKE_DATA_DIR") {
        let mode = if std::env::args().any(|arg| arg == "--native-smoke-probe") {
            "probe"
        } else if std::env::args().any(|arg| arg == "--host-version") {
            "version"
        } else {
            "application"
        };
        std::fs::write(
            std::path::PathBuf::from(directory).join("native-smoke-entry"),
            mode,
        )
        .unwrap_or_else(|_| std::process::exit(79));
    }
    if std::env::args().any(|arg| arg == "--native-smoke-probe") {
        #[cfg(feature = "native-smoke")]
        {
            if let Some(file) = std::env::var_os("RAYPX_NATIVE_SMOKE_PROBE_FILE") {
                std::fs::write(file, "raypx-native-smoke/1\n")
                    .unwrap_or_else(|_| std::process::exit(79));
            }
            println!("raypx-native-smoke/1");
            return;
        }
        #[cfg(not(feature = "native-smoke"))]
        std::process::exit(78);
    }
    raypx_desktop::shell::run();
}
