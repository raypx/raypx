use serde_json::{Value, json};
use std::{
    io::{BufRead, BufReader, Write},
    process::{Child, ChildStdin, Command, Stdio},
    sync::mpsc,
    thread,
    time::{Duration, Instant},
};

struct Client {
    child: Child,
    input: Option<ChildStdin>,
    messages: mpsc::Receiver<Value>,
    serial: u64,
}
impl Client {
    fn new() -> Self {
        let mut child = Command::new(env!("CARGO_BIN_EXE_raypx-terminal-host"))
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .unwrap();
        let input = child.stdin.take();
        let output = child.stdout.take().unwrap();
        let (tx, messages) = mpsc::channel();
        thread::spawn(move || {
            for line in BufReader::new(output).lines() {
                let Ok(line) = line else {
                    break;
                };
                let Ok(value) = serde_json::from_str(&line) else {
                    break;
                };
                if tx.send(value).is_err() {
                    break;
                }
            }
        });
        Self {
            child,
            input,
            messages,
            serial: 0,
        }
    }
    fn request(&mut self, version: u32, method: &str, params: Value) -> Value {
        self.serial += 1;
        let id = self.serial.to_string();
        writeln!(
            self.input.as_mut().unwrap(),
            "{}",
            json!({"version": version, "id": id, "method": method, "params": params})
        )
        .unwrap();
        loop {
            let value = self.messages.recv_timeout(Duration::from_secs(5)).unwrap();
            if value["id"] == id && value.get("event").is_none() {
                return value;
            }
        }
    }
    fn eof(&mut self) {
        self.input.take();
        let until = Instant::now() + Duration::from_secs(5);
        while self.child.try_wait().unwrap().is_none() {
            assert!(Instant::now() < until, "host did not stop after EOF");
            thread::sleep(Duration::from_millis(10));
        }
    }
}
impl Drop for Client {
    fn drop(&mut self) {
        self.input.take();
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn protocol_handshake_and_rejections_are_correlated() {
    let mut client = Client::new();
    assert_eq!(
        client.request(1, "hello", json!({}))["result"]["protocol"],
        1
    );
    assert_eq!(
        client.request(2, "hello", json!({}))["error"]["code"],
        "PROTOCOL_MISMATCH"
    );
    assert_eq!(
        client.request(1, "unrecognized", json!({}))["error"]["code"],
        "UNKNOWN_METHOD"
    );
    assert_eq!(
        client.request(
            1,
            "input",
            json!({"id":"missing", "data":"invalid-base64!"})
        )["error"]["code"],
        "INVALID_BYTES"
    );
    client.eof();
}

#[cfg(unix)]
#[test]
fn stdin_eof_terminates_owned_terminals() {
    let directory = tempfile::tempdir().unwrap();
    let mut client = Client::new();
    let result = client.request(1, "open", json!({
        "executable": "/bin/sh", "args": ["-c", "sleep 60"], "cwd": directory.path(), "cols":80,"rows":24,
    }));
    let pid = result["result"]["pid"].as_u64().unwrap();
    client.eof();
    let process = Command::new("/bin/ps")
        .args(["-o", "stat=", "-p", &pid.to_string()])
        .output()
        .unwrap();
    assert!(String::from_utf8_lossy(&process.stdout).trim().is_empty());
}
