#![cfg_attr(windows, windows_subsystem = "windows")]

use base64::{Engine as _, engine::general_purpose::STANDARD};
use raypx_terminal::{Attachment, Command, Error, PROTOCOL_VERSION, SessionEvent, TerminalHost};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    io::{self, BufRead, Read, Write},
    path::PathBuf,
    sync::mpsc,
    thread,
};

const LINE_LIMIT: usize = 256 * 1024;
const OUTPUT_QUEUE: usize = 128;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Request {
    version: u32,
    id: String,
    method: String,
    #[serde(default)]
    params: Value,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Open {
    executable: PathBuf,
    #[serde(default)]
    args: Vec<String>,
    cwd: PathBuf,
    cols: u16,
    rows: u16,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Id {
    id: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Input {
    id: String,
    data: String,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Resize {
    id: String,
    cols: u16,
    rows: u16,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Detach {
    id: String,
    attachment: u64,
}

fn parse<T: serde::de::DeserializeOwned>(value: Value) -> Result<T, Error> {
    serde_json::from_value(value).map_err(|_| Error("INVALID_PARAMS"))
}
fn dispatch(
    host: &TerminalHost,
    request: Request,
    pending: &mut Option<(String, Attachment)>,
) -> Result<Value, Error> {
    if request.version != PROTOCOL_VERSION {
        return Err(Error("PROTOCOL_MISMATCH"));
    }
    match request.method.as_str() {
        "hello" => {
            Ok(json!({ "protocol": PROTOCOL_VERSION, "version": env!("CARGO_PKG_VERSION") }))
        }
        "open" => {
            let p: Open = parse(request.params)?;
            serde_json::to_value(host.open(
                Command {
                    executable: p.executable,
                    args: p.args,
                    cwd: p.cwd,
                },
                p.cols,
                p.rows,
            )?)
            .map_err(|_| Error("ENCODE_FAILED"))
        }
        "list" => serde_json::to_value(host.list()?).map_err(|_| Error("ENCODE_FAILED")),
        "attach" => {
            let p: Id = parse(request.params)?;
            let attachment = host.attach(&p.id)?;
            let response = json!({
                "attachment": attachment.id,
                "snapshot": attachment.snapshot,
                "history": attachment.history.iter().map(|chunk| json!({
                    "sequence": chunk.sequence, "data": STANDARD.encode(&chunk.data),
                })).collect::<Vec<_>>(),
            });
            *pending = Some((p.id, attachment));
            Ok(response)
        }
        "detach" => {
            let p: Detach = parse(request.params)?;
            host.detach(&p.id, p.attachment)?;
            Ok(json!({"detached": true}))
        }
        "input" => {
            let p: Input = parse(request.params)?;
            let bytes = STANDARD
                .decode(p.data)
                .map_err(|_| Error("INVALID_BYTES"))?;
            host.write(&p.id, bytes)?;
            Ok(json!({"accepted": true}))
        }
        "resize" => {
            let p: Resize = parse(request.params)?;
            host.resize(&p.id, p.cols, p.rows)?;
            Ok(json!({"accepted": true}))
        }
        "close" => {
            let p: Id = parse(request.params)?;
            host.close(&p.id)?;
            Ok(json!({"cancelled": true}))
        }
        _ => Err(Error("UNKNOWN_METHOD")),
    }
}
fn forward(
    id: String,
    attachment: Attachment,
    output: mpsc::SyncSender<Value>,
) -> Result<(), Error> {
    thread::Builder::new()
        .name("raypx-pty-events".into())
        .spawn(move || {
            for event in attachment.events {
                let value = match event {
                    SessionEvent::Output(chunk) => json!({
                        "version": PROTOCOL_VERSION, "event": "output", "id": id,
                        "sequence": chunk.sequence, "data": STANDARD.encode(chunk.data),
                    }),
                    SessionEvent::Exited {
                        sequence,
                        exit_code,
                    } => json!({
                        "version": PROTOCOL_VERSION, "event": "exit", "id": id,
                        "sequence": sequence, "exitCode": exit_code,
                    }),
                };
                if output.send(value).is_err() {
                    break;
                }
            }
            // A consumer must reattach or report the dropped stream. This
            // marker is ordered after every event from this attachment.
            let _ = output.send(json!({
                "version": PROTOCOL_VERSION, "event": "detached", "id": id,
                "attachment": attachment.id,
            }));
        })
        .map_err(|_| Error("PTY_THREAD_FAILED"))?;
    Ok(())
}
fn main() {
    if std::env::args().skip(1).any(|arg| arg == "--version") {
        println!("{}", env!("CARGO_PKG_VERSION"));
        return;
    }
    let host = TerminalHost::default();
    let (output, received) = mpsc::sync_channel::<Value>(OUTPUT_QUEUE);
    thread::spawn(move || {
        let mut stdout = io::stdout().lock();
        for value in received {
            if serde_json::to_writer(&mut stdout, &value).is_err()
                || stdout
                    .write_all(b"\n")
                    .and_then(|()| stdout.flush())
                    .is_err()
            {
                break;
            }
        }
    });
    let mut stdin = io::stdin().lock();
    loop {
        // Take caps allocation even when an untrusted client omits a newline.
        let mut line = Vec::new();
        let count = match (&mut stdin)
            .take((LINE_LIMIT + 1) as u64)
            .read_until(b'\n', &mut line)
        {
            Ok(count) => count,
            Err(_) => break,
        };
        if count == 0 || count > LINE_LIMIT || line.last() != Some(&b'\n') {
            break;
        }
        let request = serde_json::from_slice::<Request>(&line);
        let mut pending = None;
        let response = match request {
            Ok(request) if !request.id.is_empty() && request.id.len() <= 120 => {
                let id = request.id.clone();
                match dispatch(&host, request, &mut pending) {
                    Ok(result) => json!({"version": PROTOCOL_VERSION, "id": id, "result": result}),
                    Err(error) => {
                        json!({"version": PROTOCOL_VERSION, "id": id, "error": {"code": error.0}})
                    }
                }
            }
            _ => {
                json!({"version": PROTOCOL_VERSION, "id": "invalid", "error": {"code": "INVALID_REQUEST"}})
            }
        };
        // A stalled client cannot accumulate responses without bound. Its
        // transport closes; host shutdown still terminates every owned PTY.
        if output.try_send(response).is_err() {
            break;
        }
        // Queue the attachment baseline before publishing any subsequent bytes.
        if let Some((id, attachment)) = pending
            && forward(id, attachment, output.clone()).is_err()
        {
            break;
        }
    }
    host.shutdown();
}
