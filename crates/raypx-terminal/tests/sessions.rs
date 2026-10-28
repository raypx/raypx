#[cfg(unix)]
use raypx_terminal::SessionEvent;
use raypx_terminal::{Command, Limits, Status, TerminalHost};
use std::{
    path::PathBuf,
    thread,
    time::{Duration, Instant},
};

fn shell(directory: &std::path::Path, script: &str) -> Command {
    #[cfg(unix)]
    let (executable, args) = (PathBuf::from("/bin/sh"), vec!["-c".into(), script.into()]);
    #[cfg(windows)]
    let (executable, args) = (
        PathBuf::from(std::env::var_os("ComSpec").unwrap()),
        vec!["/D".into(), "/Q".into(), "/C".into(), script.into()],
    );
    Command {
        executable,
        args,
        cwd: directory.into(),
    }
}
fn eventually(mut predicate: impl FnMut() -> bool) {
    let until = Instant::now() + Duration::from_secs(5);
    while !predicate() {
        assert!(Instant::now() < until, "terminal did not settle");
        thread::sleep(Duration::from_millis(10));
    }
}
fn text(host: &TerminalHost, id: &str) -> String {
    let attachment = host.attach(id).unwrap();
    String::from_utf8_lossy(
        &attachment
            .history
            .iter()
            .flat_map(|chunk| chunk.data.iter().copied())
            .collect::<Vec<_>>(),
    )
    .into_owned()
}

#[test]
fn fast_exit_is_retained_before_any_client_attaches() {
    let directory = tempfile::tempdir().unwrap();
    let host = TerminalHost::default();
    let session = host
        .open(shell(directory.path(), "echo fast-terminal-output"), 80, 24)
        .unwrap();
    eventually(|| host.snapshot(&session.id).unwrap().status == Status::Exited);
    assert!(text(&host, &session.id).contains("fast-terminal-output"));
    assert_eq!(host.snapshot(&session.id).unwrap().exit_code, Some(0));
    host.close(&session.id).unwrap();
}

#[test]
fn limits_and_shutdown_reject_work_before_spawning() {
    assert!(
        TerminalHost::new(Limits {
            sessions: 0,
            ..Limits::default()
        })
        .is_err()
    );
    let directory = tempfile::tempdir().unwrap();
    let host = TerminalHost::default();
    assert_eq!(
        host.open(shell(directory.path(), "echo invalid"), 0, 24)
            .unwrap_err()
            .0,
        "INVALID_SIZE"
    );
    host.shutdown();
    assert_eq!(
        host.open(shell(directory.path(), "echo closed"), 80, 24)
            .unwrap_err()
            .0,
        "HOST_CLOSED"
    );
}

#[test]
fn explicit_close_terminates_a_live_terminal() {
    #[cfg(unix)]
    let script = "printf ready; sleep 60";
    #[cfg(windows)]
    let script = "echo ready & ping -n 60 127.0.0.1 >nul";
    let directory = tempfile::tempdir().unwrap();
    let host = TerminalHost::default();
    let session = host.open(shell(directory.path(), script), 80, 24).unwrap();
    eventually(|| text(&host, &session.id).contains("ready"));
    assert_eq!(host.snapshot(&session.id).unwrap().status, Status::Running);
    host.close(&session.id).unwrap();
    assert_eq!(host.snapshot(&session.id).unwrap().status, Status::Exited);
}

#[cfg(unix)]
#[test]
fn detach_keeps_the_process_and_replays_output_on_reattach() {
    let directory = tempfile::tempdir().unwrap();
    let host = TerminalHost::default();
    let session = host
        .open(
            shell(
                directory.path(),
                "printf ready; read value; printf 'answer:%s' \"$value\"; read done",
            ),
            80,
            24,
        )
        .unwrap();
    eventually(|| text(&host, &session.id).contains("ready"));
    let first = host.attach(&session.id).unwrap();
    host.detach(&session.id, first.id).unwrap();
    host.write(&session.id, b"detached-value\n".to_vec())
        .unwrap();
    eventually(|| text(&host, &session.id).contains("answer:detached-value"));
    assert_eq!(host.snapshot(&session.id).unwrap().pid, session.pid);
    assert_eq!(host.snapshot(&session.id).unwrap().status, Status::Running);
    host.close(&session.id).unwrap();
}

#[cfg(unix)]
#[test]
fn resize_and_input_are_ordered_and_stale_detach_cannot_remove_a_new_attachment() {
    let directory = tempfile::tempdir().unwrap();
    let host = TerminalHost::default();
    let session = host
        .open(
            shell(
                directory.path(),
                "read value; stty size; printf 'value:%s' \"$value\"; read done",
            ),
            80,
            24,
        )
        .unwrap();
    let old = host.attach(&session.id).unwrap();
    let current = host.attach(&session.id).unwrap();
    host.detach(&session.id, old.id).unwrap();
    host.resize(&session.id, 100, 40).unwrap();
    host.write(&session.id, b"ordered\n".to_vec()).unwrap();
    let until = Instant::now() + Duration::from_secs(5);
    let mut output = String::new();
    while !output.contains("value:ordered") {
        let remaining = until.saturating_duration_since(Instant::now());
        match current.events.recv_timeout(remaining).unwrap() {
            SessionEvent::Output(chunk) => output.push_str(&String::from_utf8_lossy(&chunk.data)),
            SessionEvent::Exited { .. } => panic!("terminal exited before input"),
        }
    }
    assert!(output.contains("40 100"));
    assert_eq!(host.snapshot(&session.id).unwrap().cols, 100);
    host.close(&session.id).unwrap();
}

#[cfg(unix)]
#[test]
fn stalled_subscriber_does_not_block_output_and_history_stays_bounded() {
    let directory = tempfile::tempdir().unwrap();
    let host = TerminalHost::new(Limits {
        history_bytes: 1024,
        subscriber_events: 1,
        ..Limits::default()
    })
    .unwrap();
    let session = host.open(shell(directory.path(), "read value; i=0; while [ $i -lt 5000 ]; do printf '0123456789'; i=$((i+1)); done; printf final-marker"), 80, 24).unwrap();
    let _slow = host.attach(&session.id).unwrap();
    host.write(&session.id, b"go\n".to_vec()).unwrap();
    eventually(|| host.snapshot(&session.id).unwrap().status == Status::Exited);
    let replay = host.attach(&session.id).unwrap();
    assert!(replay.snapshot.history_truncated);
    assert!(
        replay
            .history
            .iter()
            .map(|chunk| chunk.data.len())
            .sum::<usize>()
            <= 1024
    );
    assert!(
        replay
            .history
            .iter()
            .flat_map(|chunk| &chunk.data)
            .copied()
            .collect::<Vec<_>>()
            .ends_with(b"final-marker")
    );
}

#[cfg(unix)]
#[test]
fn close_terminates_background_descendants_before_reporting_exit() {
    let directory = tempfile::tempdir().unwrap();
    let host = TerminalHost::default();
    let session = host
        .open(
            shell(directory.path(), "sleep 60 & echo $! > child.pid; wait"),
            80,
            24,
        )
        .unwrap();
    let pid_file = directory.path().join("child.pid");
    eventually(|| pid_file.is_file());
    let pid: i32 = std::fs::read_to_string(pid_file)
        .unwrap()
        .trim()
        .parse()
        .unwrap();
    host.close(&session.id).unwrap();
    assert_eq!(host.snapshot(&session.id).unwrap().status, Status::Exited);
    // A dead child can briefly remain a zombie while its new parent reaps it.
    let status = std::process::Command::new("/bin/ps")
        .args(["-o", "stat=", "-p", &pid.to_string()])
        .output()
        .unwrap();
    let state = String::from_utf8_lossy(&status.stdout);
    assert!(
        state.trim().is_empty() || state.trim().starts_with('Z'),
        "descendant still running"
    );
}

#[cfg(unix)]
#[test]
fn large_input_is_delivered_completely_to_a_reading_terminal() {
    let directory = tempfile::tempdir().unwrap();
    let host = TerminalHost::default();
    let session = host
        .open(
            shell(
                directory.path(),
                "stty raw -echo; printf ready; head -c 65536 | wc -c; printf complete; read done",
            ),
            80,
            24,
        )
        .unwrap();
    eventually(|| text(&host, &session.id).contains("ready"));
    host.write(&session.id, vec![b'x'; raypx_terminal::MAX_INPUT_BYTES])
        .unwrap();
    eventually(|| text(&host, &session.id).contains("complete"));
    assert!(text(&host, &session.id).contains("65536"));
    host.close(&session.id).unwrap();
}

#[cfg(unix)]
#[test]
fn timed_out_input_does_not_stall_later_resize() {
    let directory = tempfile::tempdir().unwrap();
    let host = std::sync::Arc::new(TerminalHost::default());
    let session = host
        .open(
            shell(directory.path(), "stty raw -echo; printf waiting; sleep 10"),
            80,
            24,
        )
        .unwrap();
    eventually(|| text(&host, &session.id).contains("waiting"));
    let written = host.write(&session.id, vec![b'x'; raypx_terminal::MAX_INPUT_BYTES]);
    let resized = host.resize(&session.id, 100, 40);
    close_with_deadline(&host, &session.id, false);
    assert_eq!(written.unwrap_err().0, "TERMINAL_IO_TIMEOUT");
    resized.unwrap();
    assert_eq!(host.snapshot(&session.id).unwrap().cols, 100);
}

#[cfg(unix)]
#[test]
fn cancellation_is_not_queued_behind_a_blocked_terminal_write() {
    cancel_blocked_write(false);
}

#[cfg(unix)]
#[test]
fn shutdown_is_not_queued_behind_a_blocked_terminal_write() {
    cancel_blocked_write(true);
}

#[cfg(unix)]
fn cancel_blocked_write(shutdown: bool) {
    let directory = tempfile::tempdir().unwrap();
    let host = std::sync::Arc::new(TerminalHost::default());
    let session = host
        .open(
            shell(directory.path(), "stty raw -echo; printf waiting; sleep 60"),
            80,
            24,
        )
        .unwrap();
    eventually(|| text(&host, &session.id).contains("waiting"));
    let writing_host = host.clone();
    let id = session.id.clone();
    let (done, received) = std::sync::mpsc::channel();
    let writer = thread::spawn(move || {
        let result = (0..64)
            .try_for_each(|_| writing_host.write(&id, vec![b'x'; raypx_terminal::MAX_INPUT_BYTES]));
        done.send(result).unwrap();
    });
    assert!(received.recv_timeout(Duration::from_millis(50)).is_err());
    close_with_deadline(&host, &session.id, shutdown);
    assert!(
        received
            .recv_timeout(Duration::from_secs(3))
            .unwrap()
            .is_err()
    );
    writer.join().unwrap();
    if shutdown {
        assert!(host.list().unwrap().is_empty());
    } else {
        assert_eq!(host.snapshot(&session.id).unwrap().status, Status::Exited);
    }
}

#[cfg(unix)]
fn close_with_deadline(host: &std::sync::Arc<TerminalHost>, id: &str, shutdown: bool) {
    let closing_host = host.clone();
    let id = id.to_owned();
    let (closed, completion) = std::sync::mpsc::channel();
    let closer = thread::spawn(move || {
        let result = if shutdown {
            closing_host.shutdown();
            Ok(())
        } else {
            closing_host.close(&id)
        };
        closed.send(result).unwrap();
    });
    completion
        .recv_timeout(Duration::from_secs(3))
        .expect("cancellation must drain blocked PTY input within its deadline")
        .unwrap();
    closer.join().unwrap();
}
