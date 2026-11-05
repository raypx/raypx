use std::{
    env,
    path::PathBuf,
    process::{self, Command},
};

#[cfg(windows)]
unsafe extern "system" fn console_control(event: u32) -> i32 {
    // The Node child receives the same console event and owns cancellation.
    // Keep its launcher alive to return Node's final exit status after cleanup.
    i32::from(event == 0 || event == 1)
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let executable = env::current_exe()?;
    let mut root: PathBuf = executable.parent().ok_or("Missing CLI directory")?.into();
    let ownership = root.join("installation.json");
    if ownership.is_file() {
        let value: serde_json::Value = serde_json::from_slice(&std::fs::read(ownership)?)?;
        let directory = value["directory"]
            .as_str()
            .ok_or("Unsupported CLI installation")?;
        let path = std::path::Path::new(directory);
        if path.is_absolute()
            || path
                .components()
                .any(|part| !matches!(part, std::path::Component::Normal(_)))
        {
            return Err("Invalid CLI runtime directory".into());
        }
        root = root.join(path);
    }
    let node = root
        .join("runtime")
        .join(if cfg!(windows) { "node.exe" } else { "node" });
    let entry = root.join("main.mjs");
    if !node.is_file() || !entry.is_file() || !root.join("runtime.json").is_file() {
        return Err("Incomplete Raypx installation; reinstall the complete CLI directory".into());
    }
    let mut command = Command::new(node);
    command
        .arg(entry)
        .args(env::args_os().skip(1))
        .env("RAYPX_CLI_EXECUTABLE", &executable);
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        Err(command.exec().into())
    }
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        use windows_sys::Win32::System::Console::{GetConsoleCP, SetConsoleCtrlHandler};
        unsafe {
            if GetConsoleCP() == 0 {
                command.creation_flags(0x08000000);
            } else if SetConsoleCtrlHandler(Some(console_control), 1) == 0 {
                return Err(std::io::Error::last_os_error().into());
            }
        }
        let status = command.status()?;
        process::exit(status.code().unwrap_or(1));
    }
}
fn main() {
    if let Err(error) = run() {
        eprintln!("Raypx: {error}");
        process::exit(1);
    }
}
