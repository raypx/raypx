use serde_json::{Value, json};
use std::io::{self, BufRead, Write};
fn main() {
    let mode = std::env::args().next_back().unwrap_or_default();
    if std::env::args().nth(1).as_deref() == Some("lock") {
        let _instance = raypx_desktop::sessions::Instance::acquire(std::path::Path::new(
            &std::env::args().nth(2).unwrap(),
        ))
        .unwrap();
        println!("locked");
        io::stdout().flush().unwrap();
        let mut line = String::new();
        io::stdin().read_line(&mut line).unwrap();
        return;
    }
    for line in io::stdin().lock().lines() {
        let packet: Value = serde_json::from_str(&line.unwrap()).unwrap();
        let result = if packet["method"] == "runtime.info" {
            json!({"version":"0.1.0","builtAt":42,"protocolVersion":1,"owner":"daemon","features":{"localTerminalApprovals":true}})
        } else {
            packet["params"].clone()
        };
        if mode == "partial-line" {
            print!("{{\"version\":1");
            io::stdout().flush().unwrap();
            return;
        }
        if mode == "stalled-reader" && packet["method"] != "runtime.info" {
            std::thread::sleep(std::time::Duration::from_secs(60));
            return;
        }
        println!("{}", json!({"version":1,"id":packet["id"],"result":result}));
        io::stdout().flush().unwrap();
    }
}
