#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    #[cfg(feature = "native-smoke")]
    {
        let args: Vec<_> = std::env::args_os()
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect();
        let diagnostic = format!(
            "args={args:?}\nsmoke_data_dir_set={}\nraypx_home_set={}\ndiagnostic_path_set={}\n",
            std::env::var_os("RAYPX_NATIVE_SMOKE_DATA_DIR").is_some(),
            std::env::var_os("RAYPX_HOME").is_some(),
            std::env::var_os("RAYPX_NATIVE_SMOKE_DIAGNOSTIC").is_some(),
        );
        let diagnostic_path = std::env::var_os("RAYPX_NATIVE_SMOKE_DIAGNOSTIC").map(Into::into);
        let recorded = diagnostic_path
            .as_ref()
            .is_some_and(|path: &std::path::PathBuf| std::fs::write(path, &diagnostic).is_ok());
        if !recorded {
            let fallback = std::env::temp_dir()
                .join(format!("raypx-native-smoke-main-{}", std::process::id()));
            let _ = std::fs::write(fallback, diagnostic);
        }
    }
    if std::env::args().any(|arg| arg == "--native-smoke-probe") {
        #[cfg(feature = "native-smoke")]
        std::process::exit(0);
        #[cfg(not(feature = "native-smoke"))]
        std::process::exit(78);
    }
    raypx_desktop::shell::run();
}
