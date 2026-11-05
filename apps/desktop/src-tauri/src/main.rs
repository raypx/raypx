#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
fn main() {
    if std::env::args().any(|arg| arg == "--native-smoke-probe") {
        #[cfg(feature = "native-smoke")]
        std::process::exit(0);
        #[cfg(not(feature = "native-smoke"))]
        std::process::exit(78);
    }
    raypx_desktop::shell::run();
}
