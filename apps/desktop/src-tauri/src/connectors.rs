use serde_json::{Value, json};
use std::{path::Path, time::Duration};
use tokio::{io::AsyncReadExt, process::Command};

async fn bounded(mut reader: impl tokio::io::AsyncRead + Unpin) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    (&mut reader)
        .take(256 * 1024 + 1)
        .read_to_end(&mut bytes)
        .await
        .map_err(|_| "INSTALLATION_FAILED")?;
    if bytes.len() > 256 * 1024 {
        return Err("INSTALLATION_FAILED".into());
    }
    Ok(bytes)
}
pub async fn repair(
    binary: &Path,
    args: &[String],
    input: &Value,
    directories: &Value,
) -> Result<Value, String> {
    if !binary.is_absolute() {
        return Err("INSTALLATION_FAILED".into());
    }
    let provider = input["provider"]
        .as_str()
        .filter(|provider| ["claude", "codex"].contains(provider))
        .ok_or("INSTALLATION_FAILED")?;
    let mut child = Command::new(binary)
        .args([
            "connectors",
            "repair",
            provider,
            &json!({"configDirs":directories}).to_string(),
            "--json",
        ])
        .args(args)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|_| "INSTALLATION_FAILED")?;
    let stdout = child.stdout.take().ok_or("INSTALLATION_FAILED")?;
    let stderr = child.stderr.take().ok_or("INSTALLATION_FAILED")?;
    let result = tokio::time::timeout(Duration::from_secs(20), async {
        tokio::try_join!(bounded(stdout), bounded(stderr), async {
            child
                .wait()
                .await
                .map_err(|_| "INSTALLATION_FAILED".to_owned())
        })
    })
    .await;
    let result = match result {
        Ok(result) => result,
        Err(_) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err("INSTALLATION_TIMEOUT".into());
        }
    };
    let (out, err, status) = match result {
        Ok(result) => result,
        Err(error) => {
            let _ = child.kill().await;
            let _ = child.wait().await;
            return Err(error);
        }
    };
    if !status.success() {
        let codes = [
            "INSTALLATION_BUSY",
            "INSTALLATION_CONFLICT",
            "HOST_DOWNGRADE",
            "HOST_UPDATE_REQUIRED",
            "UNSUPPORTED_PLATFORM",
            "EACCES",
            "EPERM",
        ];
        for line in err.split(|byte| *byte == b'\n') {
            if let Ok(value) = serde_json::from_slice::<Value>(line)
                && let Some(code) = value["code"].as_str().filter(|code| codes.contains(code))
            {
                return Err(code.to_owned());
            }
        }
        return Err("INSTALLATION_FAILED".into());
    }
    serde_json::from_slice(&out).map_err(|_| "INSTALLATION_FAILED".into())
}
