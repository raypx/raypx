// Windows-only experimental launcher. No Cargo dependencies or Tauri build.
#![cfg(windows)]
use std::{
    env,
    ffi::{c_void, OsStr, OsString},
    io, mem,
    os::windows::ffi::OsStrExt,
    path::{Path, PathBuf},
    ptr,
};
type Handle = *mut c_void;
#[repr(C)]
#[derive(Default)]
struct Startup {
    cb: u32,
    reserved: Handle,
    desktop: Handle,
    title: Handle,
    x: u32,
    y: u32,
    width: u32,
    height: u32,
    chars_x: u32,
    chars_y: u32,
    fill: u32,
    flags: u32,
    show: u16,
    reserved_size: u16,
    reserved_bytes: Handle,
    stdin: Handle,
    stdout: Handle,
    stderr: Handle,
}
#[repr(C)]
#[derive(Default)]
struct Process {
    process: Handle,
    thread: Handle,
    pid: u32,
    tid: u32,
}
#[repr(C)]
#[derive(Default)]
struct BasicLimits {
    process_time: i64,
    job_time: i64,
    flags: u32,
    min_working: usize,
    max_working: usize,
    active: u32,
    affinity: usize,
    priority: u32,
    scheduling: u32,
}
#[repr(C)]
#[derive(Default)]
struct Limits {
    basic: BasicLimits,
    io: [u64; 6],
    process_memory: usize,
    job_memory: usize,
    peak_process: usize,
    peak_job: usize,
}
#[link(name = "kernel32")]
unsafe extern "system" {
    fn CreateJobObjectW(attributes: Handle, name: *const u16) -> Handle;
    fn SetInformationJobObject(job: Handle, class: u32, data: Handle, size: u32) -> i32;
    fn AssignProcessToJobObject(job: Handle, process: Handle) -> i32;
    fn CreateProcessW(
        app: *const u16,
        command: *mut u16,
        process_attr: Handle,
        thread_attr: Handle,
        inherit: i32,
        flags: u32,
        environment: Handle,
        cwd: *const u16,
        startup: *const Startup,
        process: *mut Process,
    ) -> i32;
    fn GetStartupInfoW(startup: *mut Startup);
    fn GetStdHandle(kind: u32) -> Handle;
    fn SetHandleInformation(handle: Handle, mask: u32, flags: u32) -> i32;
    fn ResumeThread(thread: Handle) -> u32;
    fn WaitForSingleObject(handle: Handle, milliseconds: u32) -> u32;
    fn GetExitCodeProcess(process: Handle, code: *mut u32) -> i32;
    fn TerminateProcess(process: Handle, code: u32) -> i32;
    fn CloseHandle(handle: Handle) -> i32;
    fn SetConsoleCtrlHandler(
        handler: Option<unsafe extern "system" fn(u32) -> i32>,
        add: i32,
    ) -> i32;
}
struct Owned(Handle);
impl Drop for Owned {
    fn drop(&mut self) {
        unsafe {
            CloseHandle(self.0);
        }
    }
}
fn check(ok: bool) -> io::Result<()> {
    if ok {
        Ok(())
    } else {
        Err(io::Error::last_os_error())
    }
}
fn wide(value: &OsStr) -> Vec<u16> {
    value.encode_wide().chain(Some(0)).collect()
}
// Windows CRT argv quoting, including Unicode, quotes and trailing backslashes.
fn quoted(value: &OsStr) -> Vec<u16> {
    let mut output = vec![34];
    let mut slashes = 0;
    for c in value.encode_wide() {
        if c == 92 {
            slashes += 1;
            continue;
        }
        output.extend(std::iter::repeat_n(
            92,
            if c == 34 { slashes * 2 + 1 } else { slashes },
        ));
        output.push(c);
        slashes = 0;
    }
    output.extend(std::iter::repeat_n(92, slashes * 2));
    output.push(34);
    output
}
unsafe extern "system" fn console_control(kind: u32) -> i32 {
    // Bun receives Ctrl-C / Ctrl-Break directly; keep the launcher alive to return its exit status.
    i32::from(kind <= 1)
}
fn payload(launcher: &Path) -> io::Result<PathBuf> {
    let parent = launcher
        .parent()
        .ok_or_else(|| io::Error::other("Launcher has no directory"))?;
    let root = if parent.join("runtime.json").is_file() {
        parent.to_path_buf()
    } else {
        parent.join("versions").join(concat!(
            env!("RAYPX_SPLIT_VERSION"),
            "-",
            env!("RAYPX_SPLIT_BUILT_AT")
        ))
    };
    if !root.join("runtime.json").is_file()
        || !root.join("bun.exe").is_file()
        || !root.join("cli.js").is_file()
    {
        return Err(io::Error::other("Incomplete Raypx runtime"));
    }
    Ok(root)
}
fn run() -> io::Result<u32> {
    let launcher = env::current_exe()?;
    let root = payload(&launcher)?;
    let bun = root.join("bun.exe");
    let mut args: Vec<OsString> = env::args_os().skip(1).collect();
    let detached = args.first().is_some_and(|a| a == "--raypx-split-detach");
    if detached {
        args.remove(0);
        if args.len() < 2 || args[0] != "daemon" || args[1] != "run" {
            return Err(io::Error::other("Invalid detached entry"));
        }
    }
    let runtime = env::var_os("BUN_BE_BUN").is_some_and(|v| v == "1");
    if !runtime {
        args.insert(0, root.join("cli.js").into_os_string());
        // Consumed and removed by the CLI installation module, never a Herdr source override.
        unsafe {
            env::set_var("RAYPX_SPLIT_LAUNCHER", &launcher);
        }
    }
    let mut command = quoted(bun.as_os_str());
    for arg in &args {
        command.push(32);
        command.extend(quoted(arg));
    }
    command.push(0);
    unsafe {
        let job = if detached {
            None
        } else {
            let handle = CreateJobObjectW(ptr::null_mut(), ptr::null());
            check(!handle.is_null())?;
            let job = Owned(handle);
            let mut limits = Limits::default();
            limits.basic.flags = 0x2000 | 0x800; // KILL_ON_JOB_CLOSE | BREAKAWAY_OK
            check(
                SetInformationJobObject(
                    job.0,
                    9,
                    (&mut limits as *mut Limits).cast(),
                    mem::size_of::<Limits>() as u32,
                ) != 0,
            )?;
            Some(job)
        };
        let mut startup = Startup::default();
        GetStartupInfoW(&mut startup);
        startup.cb = mem::size_of::<Startup>() as u32;
        if !detached {
            startup.stdin = GetStdHandle(-10_i32 as u32);
            startup.stdout = GetStdHandle(-11_i32 as u32);
            startup.stderr = GetStdHandle(-12_i32 as u32);
            for h in [startup.stdin, startup.stdout, startup.stderr] {
                if !h.is_null() && h as isize != -1 {
                    check(SetHandleInformation(h, 1, 1) != 0)?;
                }
            }
            startup.flags |= 0x100; // STARTF_USESTDHANDLES
        } else {
            startup.flags &= !0x100;
        }
        let mut child = Process::default();
        // The daemon alone breaks out of a foreground job. Its own IPC stop owns shutdown.
        let flags = 0x400 | 0x4 | if detached { 0x01000000 | 0x8 } else { 0 };
        check(
            CreateProcessW(
                wide(bun.as_os_str()).as_ptr(),
                command.as_mut_ptr(),
                ptr::null_mut(),
                ptr::null_mut(),
                i32::from(!detached),
                flags,
                ptr::null_mut(),
                ptr::null(),
                &startup,
                &mut child,
            ) != 0,
        )?;
        let process = Owned(child.process);
        let thread = Owned(child.thread);
        if let Some(job) = &job {
            if AssignProcessToJobObject(job.0, process.0) == 0 {
                let error = io::Error::last_os_error();
                TerminateProcess(process.0, 1);
                return Err(error);
            }
            SetConsoleCtrlHandler(Some(console_control), 1);
        }
        if ResumeThread(thread.0) == u32::MAX {
            TerminateProcess(process.0, 1);
            return Err(io::Error::last_os_error());
        }
        if detached {
            return Ok(0);
        }
        check(WaitForSingleObject(process.0, u32::MAX) == 0)?;
        let mut code = 1;
        check(GetExitCodeProcess(process.0, &mut code) != 0)?;
        Ok(code)
    }
}
fn main() {
    match run() {
        Ok(code) => std::process::exit(code as i32),
        Err(error) => {
            eprintln!("Raypx experimental launcher failed: {error}");
            std::process::exit(1);
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quotes_windows_arguments() {
        assert_eq!(
            quoted(OsStr::new("中文 # x")),
            "\"中文 # x\"".encode_utf16().collect::<Vec<_>>()
        );
        assert_eq!(
            quoted(OsStr::new("a\\\"b\\")),
            "\"a\\\\\\\"b\\\\\"".encode_utf16().collect::<Vec<_>>()
        );
        assert_eq!(mem::size_of::<Startup>(), 104);
        assert_eq!(mem::size_of::<Limits>(), 144);
    }
}
