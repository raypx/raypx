use raypx_desktop::{
    api, config,
    cookies::{CookieJar, CookieMutation, KeyStore, KeyStoreUnavailable, parse_cookie},
    external, local_request, lock,
    prefs::PreferenceStore,
};
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    fs,
    sync::{Arc, Mutex},
};

fn fixture(name: &str) -> Vec<Value> {
    let file = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../tests/fixtures/native")
        .join(format!("{name}.json"));
    serde_json::from_slice(&fs::read(file).unwrap()).unwrap()
}

#[test]
fn shared_connection_rules() {
    for item in fixture("config") {
        let result = config::parse(item["source"].as_str().unwrap());
        if item["invalid"] == true {
            assert!(result.is_err(), "{}", item["name"]);
        } else {
            let result = result.unwrap();
            assert_eq!(
                json!({"apiUrl":result.api_url,"webUrl":result.web_url}),
                item["expected"],
                "{}",
                item["name"]
            );
        }
    }
    assert!(config::parse(&" ".repeat(16 * 1024 + 1)).is_err());
    let error = config::parse("base_url=\"https://user:private-password@api.test\"").unwrap_err();
    assert!(!error.contains("private-password"));
    let temp = tempfile::tempdir().unwrap();
    let first = config::load(Some(temp.path().into())).unwrap();
    assert_eq!(
        fs::read_to_string(temp.path().join("config.toml")).unwrap(),
        config::DEFAULT_CONFIG
    );
    assert_eq!(first.api_url, "https://raypx.pro");
}

#[test]
fn shared_local_policy() {
    for item in fixture("local-methods") {
        assert_eq!(
            local_request::assert_renderer_method(item["method"].as_str().unwrap()).is_ok(),
            item["allowed"].as_bool().unwrap(),
            "{}",
            item["method"]
        );
    }
    for item in fixture("account-scopes") {
        assert_eq!(
            local_request::scope_local_account(item["scope"].as_str().unwrap(), &item["input"]),
            item["expected"]
        );
    }
    assert!(local_request::assert_renderer_method("unknown.futureCommand").is_err());
    assert_eq!(
        local_request::renderer_params(
            "connectors.install",
            &json!({"provider":"codex","configDirs":{"codex":"untrusted"}}),
            &json!({"codex":"trusted"}),
            "test"
        )
        .unwrap()["configDirs"]["codex"],
        "trusted"
    );
}

#[test]
fn shared_api_path_rules() {
    let origin = url::Url::parse("https://api.example.test").unwrap();
    for item in fixture("api-paths") {
        assert_eq!(
            api::validate_request(
                &origin,
                item["input"].clone(),
                item["native"].as_bool().unwrap()
            )
            .is_ok(),
            item["allowed"].as_bool().unwrap(),
            "{}",
            item["input"]
        );
    }
}

#[test]
fn shared_cookie_rules() {
    let origin = url::Url::parse("https://api.example.test").unwrap();
    for item in fixture("cookies") {
        let parsed = parse_cookie(&origin, item["raw"].as_str().unwrap(), 1_700_000_000.0);
        match item["outcome"].as_str().unwrap() {
            "error" => assert!(parsed.is_err(), "{}", item["raw"]),
            "ignore" => assert_eq!(parsed.unwrap(), None),
            "remove" => assert!(matches!(
                parsed.unwrap(),
                Some(CookieMutation::Remove { .. })
            )),
            "set" => {
                let Some(CookieMutation::Set(cookie)) = parsed.unwrap() else {
                    panic!("Expected cookie");
                };
                let actual = serde_json::to_value(cookie).unwrap();
                for (key, value) in item["expected"].as_object().unwrap() {
                    assert_eq!(&actual[key], value, "{key}");
                }
            }
            _ => panic!("Unknown outcome"),
        }
    }
}

#[test]
fn raw_preferences_are_atomic_private_and_bounded() {
    let temp = tempfile::tempdir().unwrap();
    let mut store = PreferenceStore::new(temp.path().into());
    assert_eq!(store.snapshot()["status"], "missing");
    assert!(store.save(json!({"theme":"dark","future":{"value":true}})));
    assert!(store.save(json!({"locale":"zh"})));
    assert!(!store.save(json!({"oversized":"x".repeat(4096)})));
    assert_eq!(store.read()["future"]["value"], true);
    assert_eq!(
        PreferenceStore::new(temp.path().into()).read(),
        store.read()
    );
    fs::write(temp.path().join("preferences.json"), "invalid").unwrap();
    assert_eq!(
        PreferenceStore::new(temp.path().into()).snapshot()["status"],
        "unreadable"
    );
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        assert_eq!(
            fs::metadata(temp.path().join("preferences.json"))
                .unwrap()
                .permissions()
                .mode()
                & 0o777,
            0o600
        );
    }
}

#[test]
fn preference_preload_preserves_json_keys_and_renderer_validation() {
    use std::{
        io::Write,
        process::{Command, Stdio},
    };

    for (fields, valid) in [
        (json!({"theme":"dark","locale":"zh"}), true),
        (json!({"locale":"zh"}), false),
        (json!({"theme":"dark"}), false),
        (json!({}), false),
    ] {
        let temp = tempfile::tempdir().unwrap();
        let mut raw = json!({
            "__proto__":{"theme":"dark","locale":"zh","polluted":true},
            "nested":{"__proto__":{"polluted":true}},
            "text":"</script>\\\"\u{2028}\u{2029}"
        });
        raw.as_object_mut()
            .unwrap()
            .extend(fields.as_object().unwrap().clone());
        let mut store = PreferenceStore::new(temp.path().into());
        assert!(store.save(raw.clone()));
        let script = store.preload();
        assert!(!script.contains('<'));

        let desktop = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .parent()
            .unwrap();
        let mut child = Command::new(std::env::var_os("RAYPX_BUN").unwrap_or_else(|| "bun".into()))
            .arg(desktop.join("tests/native/fixtures/preferences-preload.ts"))
            .current_dir(desktop)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .expect("Bun is required to execute the real preference preload");
        child
            .stdin
            .take()
            .unwrap()
            .write_all(json!({"script":script}).to_string().as_bytes())
            .unwrap();
        let output = child.wait_with_output().unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
        let result: Value = serde_json::from_slice(&output.stdout).unwrap();
        assert_eq!(
            result,
            json!({
                "snapshot":{"status":"read","raw":raw},
                "ownProto":true,
                "prototypeUnchanged":true,
                "inheritedPollution":false,
                "globalsClean":true,
                "deepFrozen":true,
                "valid":valid
            })
        );
    }
}

#[test]
fn instance_lock_is_exclusive_and_releases_without_unlinking() {
    let temp = tempfile::tempdir().unwrap();
    let first = lock::acquire(temp.path()).unwrap().unwrap();
    assert!(lock::acquire(temp.path()).unwrap().is_none());
    let probe = |expected: &str| {
        let output = std::process::Command::new(std::env::current_exe().unwrap())
            .args([
                "--exact",
                "instance_lock_child_probe",
                "--ignored",
                "--nocapture",
            ])
            .env("RAYPX_LOCK_TEST_DIRECTORY", temp.path())
            .env("RAYPX_LOCK_TEST_EXPECTED", expected)
            .output()
            .unwrap();
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stdout)
        );
    };
    probe("busy");
    drop(first);
    assert!(temp.path().join("desktop-instance.sqlite").exists());
    probe("available");
    assert!(lock::acquire(temp.path()).unwrap().is_some());
}

#[test]
#[ignore = "Only executed by the cross-process lock test"]
fn instance_lock_child_probe() {
    use std::io::{BufRead, Write};
    let directory = std::env::var_os("RAYPX_LOCK_TEST_DIRECTORY").unwrap();
    let expected = std::env::var("RAYPX_LOCK_TEST_EXPECTED").unwrap();
    if expected == "takeover" {
        let stdin = std::io::stdin();
        let mut input = stdin.lock();
        let mut line = String::new();
        println!("LOCK_READY");
        std::io::stdout().flush().unwrap();
        input.read_line(&mut line).unwrap();
        let acquired = lock::acquire(std::path::Path::new(&directory)).unwrap();
        println!(
            "{}",
            if acquired.is_some() {
                "LOCK_OWNED"
            } else {
                "LOCK_BLOCKED"
            }
        );
        std::io::stdout().flush().unwrap();
        if acquired.is_some() {
            line.clear();
            input.read_line(&mut line).unwrap();
        }
        return;
    }
    let acquired = lock::acquire(std::path::Path::new(&directory)).unwrap();
    assert_eq!(acquired.is_some(), expected == "available");
}

#[test]
fn exactly_one_process_takes_over_the_released_instance_lock() {
    use std::{
        io::{BufRead, BufReader, Read, Write},
        process::{Child, Command, ExitStatus, Stdio},
        sync::mpsc::{self, Receiver, Sender},
        thread::{self, JoinHandle},
        time::{Duration, Instant},
    };
    fn drain(
        reader: impl Read + Send + 'static,
        lines: Option<Sender<String>>,
    ) -> JoinHandle<String> {
        thread::spawn(move || {
            let mut transcript = String::new();
            for line in BufReader::new(reader).lines() {
                let line = match line {
                    Ok(line) => line,
                    Err(error) => return format!("{transcript}\nPipe read failed: {error}"),
                };
                if transcript.len() < 64 * 1024 {
                    transcript.push_str(&line);
                    transcript.push('\n');
                }
                if let Some(sender) = &lines {
                    let _ = sender.send(line);
                }
            }
            transcript
        })
    }
    struct Contender {
        child: Child,
        lines: Receiver<String>,
        stdout: Option<JoinHandle<String>>,
        stderr: Option<JoinHandle<String>>,
    }
    impl Contender {
        fn report(&self, targets: &[&str]) -> Result<String, String> {
            let deadline = Instant::now() + Duration::from_secs(10);
            loop {
                let line = self
                    .lines
                    .recv_timeout(deadline.saturating_duration_since(Instant::now()))
                    .map_err(|error| {
                        format!(
                            "Lock contender {} did not report {targets:?}: {error}",
                            self.child.id()
                        )
                    })?;
                if targets.contains(&line.trim()) {
                    return Ok(line.trim().to_owned());
                }
            }
        }
        fn release(&mut self) {
            drop(self.child.stdin.take());
        }
        fn finish(&mut self) -> (Option<ExitStatus>, String) {
            let deadline = Instant::now() + Duration::from_secs(10);
            let status = loop {
                match self.child.try_wait() {
                    Ok(Some(status)) => break Some(status),
                    Ok(None) if Instant::now() < deadline => {
                        thread::sleep(Duration::from_millis(10))
                    }
                    _ => {
                        let _ = self.child.kill();
                        let _ = self.child.wait();
                        break None;
                    }
                }
            };
            let stdout = self
                .stdout
                .take()
                .map(|thread| thread.join().unwrap())
                .unwrap_or_default();
            let stderr = self
                .stderr
                .take()
                .map(|thread| thread.join().unwrap())
                .unwrap_or_default();
            (
                status,
                format!(
                    "pid={} status={status:?}\nstdout:\n{stdout}stderr:\n{stderr}",
                    self.child.id()
                ),
            )
        }
    }
    impl Drop for Contender {
        fn drop(&mut self) {
            self.release();
            let _ = self.child.kill();
            let _ = self.child.wait();
            if let Some(reader) = self.stdout.take() {
                let _ = reader.join();
            }
            if let Some(reader) = self.stderr.take() {
                let _ = reader.join();
            }
        }
    }
    let directory = tempfile::tempdir().unwrap();
    let mut owner = lock::acquire(directory.path()).unwrap();
    assert!(owner.is_some());
    let mut children = Vec::<Contender>::new();
    let result = (|| -> Result<usize, String> {
        for _ in 0..4 {
            let mut child = Command::new(std::env::current_exe().unwrap())
                .args([
                    "--exact",
                    "instance_lock_child_probe",
                    "--ignored",
                    "--nocapture",
                    "--quiet",
                ])
                .env("RAYPX_LOCK_TEST_DIRECTORY", directory.path())
                .env("RAYPX_LOCK_TEST_EXPECTED", "takeover")
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|error| format!("Unable to start lock contender: {error}"))?;
            let (sender, lines) = mpsc::channel();
            let stdout = drain(child.stdout.take().unwrap(), Some(sender));
            let stderr = drain(child.stderr.take().unwrap(), None);
            children.push(Contender {
                child,
                lines,
                stdout: Some(stdout),
                stderr: Some(stderr),
            });
            children.last().unwrap().report(&["LOCK_READY"])?;
        }
        drop(owner.take());
        for contender in &mut children {
            contender
                .child
                .stdin
                .as_mut()
                .unwrap()
                .write_all(b"acquire\n")
                .map_err(|error| format!("Unable to release lock contender barrier: {error}"))?;
        }
        let mut owners = 0;
        for contender in &children {
            owners +=
                usize::from(contender.report(&["LOCK_OWNED", "LOCK_BLOCKED"])? == "LOCK_OWNED");
        }
        Ok(owners)
    })();
    drop(owner);
    // Keep draining libtest output through process exit, even when acquisition fails.
    for contender in &mut children {
        contender.release();
    }
    let completed: Vec<_> = children.iter_mut().map(Contender::finish).collect();
    let diagnostics = completed
        .iter()
        .map(|(_, text)| text.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    let owners = result.unwrap_or_else(|error| panic!("{error}\n{diagnostics}"));
    assert_eq!(owners, 1, "{diagnostics}");
    assert!(
        completed
            .iter()
            .all(|(status, _)| status.is_some_and(|status| status.success())),
        "{diagnostics}"
    );
}

#[test]
fn external_urls_keep_credentials_and_control_characters_out() {
    assert_eq!(
        external::external_url("https://example.test/path").as_deref(),
        Some("https://example.test/path")
    );
    for value in [
        "javascript:alert(1)",
        "file:///etc/passwd",
        "https://user:key@example.test",
        "https://example.test/\n",
    ] {
        assert!(external::external_url(value).is_none());
    }
}

#[derive(Default)]
struct MemoryKeys {
    values: Mutex<HashMap<String, String>>,
    unavailable: bool,
}
impl KeyStore for MemoryKeys {
    fn get(&self, name: &str) -> Result<Option<String>, KeyStoreUnavailable> {
        if self.unavailable {
            Err(KeyStoreUnavailable)
        } else {
            Ok(self.values.lock().unwrap().get(name).cloned())
        }
    }
    fn set(&self, name: &str, value: &str) -> Result<(), KeyStoreUnavailable> {
        if self.unavailable {
            Err(KeyStoreUnavailable)
        } else {
            self.values
                .lock()
                .unwrap()
                .insert(name.into(), value.into());
            Ok(())
        }
    }
}

#[test]
fn encrypted_sessions_restore_only_persistent_cookies_and_recover_corruption() {
    let temp = tempfile::tempdir().unwrap();
    let keys = Arc::new(MemoryKeys::default());
    let origin = url::Url::parse("https://api.example.test").unwrap();
    let mut jar =
        CookieJar::open_with_keys(temp.path().into(), origin.as_str(), keys.clone()).unwrap();
    let cookie = parse_cookie(
        &origin,
        "better-auth.session_token=private-value; Path=/; Secure; HttpOnly; Max-Age=3600",
        raypx_desktop::cookies::now(),
    )
    .unwrap()
    .unwrap();
    jar.apply(vec![cookie]).unwrap();
    let sealed = fs::read(temp.path().join("session-v2.enc")).unwrap();
    assert!(!String::from_utf8_lossy(&sealed).contains("private-value"));
    let restored =
        CookieJar::open_with_keys(temp.path().into(), origin.as_str(), keys.clone()).unwrap();
    assert_eq!(
        restored.header(&origin).unwrap().as_deref(),
        Some("better-auth.session_token=private-value")
    );
    fs::write(temp.path().join("session-v2.enc"), "corrupt").unwrap();
    let reset = CookieJar::open_with_keys(temp.path().into(), origin.as_str(), keys).unwrap();
    assert_eq!(reset.recovery, Some("reset"));
    assert!(reset.header(&origin).unwrap().is_none());
}

#[test]
fn temporarily_unavailable_keys_preserve_ciphertext() {
    let temp = tempfile::tempdir().unwrap();
    fs::write(temp.path().join("tauri-session-v2"), "2").unwrap();
    fs::write(temp.path().join("session-v2.enc"), "existing ciphertext").unwrap();
    let jar = CookieJar::open_with_keys(
        temp.path().into(),
        "https://api.example.test",
        Arc::new(MemoryKeys {
            unavailable: true,
            ..Default::default()
        }),
    )
    .unwrap();
    assert_eq!(jar.recovery, Some("temporary"));
    assert_eq!(
        fs::read(temp.path().join("session-v2.enc")).unwrap(),
        b"existing ciphertext"
    );
}

async fn http_fixture(response: String) -> (String, tokio::task::JoinHandle<String>) {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let task = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut request = Vec::new();
        loop {
            let mut chunk = [0u8; 1024];
            let length = socket.read(&mut chunk).await.unwrap();
            if length == 0 {
                break;
            }
            request.extend_from_slice(&chunk[..length]);
            if request.windows(4).any(|v| v == b"\r\n\r\n") {
                break;
            }
        }
        socket.write_all(response.as_bytes()).await.unwrap();
        socket.shutdown().await.unwrap();
        String::from_utf8_lossy(&request).into_owned()
    });
    (origin, task)
}

#[tokio::test]
async fn api_keeps_cookies_native_and_strips_response_headers() {
    let (origin, request) = http_fixture("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nContent-Type: application/json\r\nSet-Cookie: better-auth.session_token=new; Path=/; HttpOnly; Max-Age=3600\r\nX-Request-Id: test\r\nX-Secret: hidden\r\nConnection: close\r\n\r\n{}".into()).await;
    let mut jar = CookieJar::memory(&origin).unwrap();
    jar.apply(vec![
        parse_cookie(
            &url::Url::parse(&origin).unwrap(),
            "better-auth.session_token=private-value; Path=/; HttpOnly; Max-Age=3600",
            raypx_desktop::cookies::now(),
        )
        .unwrap()
        .unwrap(),
    ])
    .unwrap();
    let api = api::Api::with_cookies(&origin, jar).unwrap();
    let response = api
        .request(json!({"path":"/api/auth/get-session","method":"GET","headers":{}}))
        .await
        .unwrap();
    assert_eq!(response["status"], 200);
    assert_eq!(response["body"], "{}");
    assert_eq!(response["headers"]["x-request-id"], "test");
    assert!(response["headers"].get("set-cookie").is_none());
    assert!(response["headers"].get("x-secret").is_none());
    assert!(!response.to_string().contains("private-value"));
    let request = request.await.unwrap().to_ascii_lowercase();
    assert!(request.contains("cookie: better-auth.session_token=private-value"));
    assert!(request.contains("origin: views://main"));
}

#[tokio::test]
async fn api_cancellation_and_duplicate_ids_are_owned_by_the_active_request() {
    use tokio::io::AsyncReadExt;
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut buffer = [0; 1024];
        let _ = socket.read(&mut buffer).await;
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    });
    let api = api::Api::with_cookies(&origin, CookieJar::memory(&origin).unwrap()).unwrap();
    let id = uuid::Uuid::new_v4().to_string();
    let input = json!({"id":id,"path":"/api/auth/get-session","method":"GET","headers":{}});
    let owned = api.clone();
    let first = input.clone();
    let pending = tokio::spawn(async move { owned.request(first).await });
    tokio::time::sleep(std::time::Duration::from_millis(30)).await;
    assert_eq!(
        api.request(input).await.unwrap_err(),
        "Invalid API request identity"
    );
    assert!(api.cancel(&id));
    assert_eq!(pending.await.unwrap().unwrap_err(), "API request cancelled");
    server.abort();
}

#[tokio::test]
async fn api_rejects_oversized_bodies_without_reading_them_and_never_follows_redirects() {
    let (origin, request) = http_fixture(
        "HTTP/1.1 200 OK\r\nContent-Length: 8388609\r\nConnection: close\r\n\r\n".into(),
    )
    .await;
    let api = api::Api::with_cookies(&origin, CookieJar::memory(&origin).unwrap()).unwrap();
    assert_eq!(
        api.request(json!({"path":"/api/auth/get-session","method":"GET","headers":{}}))
            .await
            .unwrap_err(),
        "API response exceeds limit"
    );
    request.await.unwrap();
    let (origin, request) = http_fixture("HTTP/1.1 302 Found\r\nContent-Length: 0\r\nLocation: https://external.example.test\r\nConnection: close\r\n\r\n".into()).await;
    let api = api::Api::with_cookies(&origin, CookieJar::memory(&origin).unwrap()).unwrap();
    let response = api
        .request(json!({"path":"/api/auth/get-session","method":"GET","headers":{}}))
        .await
        .unwrap();
    assert_eq!(response["status"], 302);
    assert!(response["headers"].get("location").is_none());
    request.await.unwrap();
}

#[tokio::test]
async fn native_rpc_distinguishes_plain_missing_procedures_from_rpc_not_found() {
    for (body, expected) in [
        (r#"{"error":{"code":"NOT_FOUND"}}"#, "MISSING_PROCEDURE"),
        (
            r#"{"json":{"defined":false,"code":"NOT_FOUND","message":"Not found"}}"#,
            "NOT_FOUND",
        ),
    ] {
        let (origin, request) = http_fixture(format!("HTTP/1.1 404 Not Found\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",body.len())).await;
        let api = api::Api::with_cookies(&origin, CookieJar::memory(&origin).unwrap()).unwrap();
        assert_eq!(
            api.rpc("hosts.authorize", json!({"deviceId":"test","epoch":1}))
                .await
                .unwrap_err(),
            expected
        );
        assert!(request.await.unwrap().contains("POST /rpc/hosts/authorize"));
    }
}

#[test]
fn failed_cookie_persistence_disables_the_session_without_committing_the_batch() {
    let temp = tempfile::tempdir().unwrap();
    let keys = Arc::new(MemoryKeys::default());
    let origin = url::Url::parse("https://api.example.test").unwrap();
    let mut jar = CookieJar::open_with_keys(temp.path().into(), origin.as_str(), keys).unwrap();
    // A directory cannot atomically replace the target ciphertext file.
    fs::create_dir(temp.path().join("session-v2.enc")).unwrap();
    let cookie = parse_cookie(
        &origin,
        "better-auth.session_token=private; Path=/; Secure; HttpOnly; Max-Age=3600",
        raypx_desktop::cookies::now(),
    )
    .unwrap()
    .unwrap();
    assert!(jar.apply(vec![cookie]).is_err());
    assert!(
        jar.header(&origin)
            .unwrap_err()
            .contains("restart required")
    );
}

#[cfg(unix)]
#[test]
fn absolute_symlinked_config_directories_preserve_user_managed_files() {
    let temp = tempfile::tempdir().unwrap();
    let actual = temp.path().join("actual");
    fs::create_dir(&actual).unwrap();
    fs::write(
        actual.join("config.toml"),
        "base_url=\"https://example.test\"",
    )
    .unwrap();
    let linked = temp.path().join("linked");
    std::os::unix::fs::symlink(&actual, &linked).unwrap();
    assert_eq!(
        config::load(Some(linked)).unwrap().api_url,
        "https://example.test"
    );
    assert_eq!(
        fs::read_to_string(actual.join("config.toml")).unwrap(),
        "base_url=\"https://example.test\""
    );
    assert!(
        config::load(Some("relative-config".into()))
            .unwrap_err()
            .contains("absolute")
    );
}

#[test]
fn preferences_enforce_utf8_byte_limits_on_read_and_write() {
    let temp = tempfile::tempdir().unwrap();
    let mut store = PreferenceStore::new(temp.path().into());
    assert!(!store.save(json!({"future":"é".repeat(2048)})));
    assert_eq!(store.snapshot()["status"], "missing");
    fs::write(
        temp.path().join("preferences.json"),
        json!({"future":"é".repeat(2048)}).to_string(),
    )
    .unwrap();
    assert_eq!(
        PreferenceStore::new(temp.path().into()).snapshot()["status"],
        "unreadable"
    );
}

#[tokio::test]
async fn concurrent_cookie_response_batches_merge_into_the_latest_jar() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let origin = format!("http://{}", listener.local_addr().unwrap());
    let server = tokio::spawn(async move {
        let barrier = Arc::new(tokio::sync::Barrier::new(2));
        let mut responders = Vec::new();
        for name in ["first", "second"] {
            let (mut socket, _) = listener.accept().await.unwrap();
            let barrier = barrier.clone();
            responders.push(tokio::spawn(async move {
                let mut buffer = [0u8; 2048];
                let _ = socket.read(&mut buffer).await.unwrap();
                barrier.wait().await;
                socket.write_all(format!("HTTP/1.1 200 OK\r\nContent-Length: 2\r\nSet-Cookie: better-auth.{name}=value; Path=/; HttpOnly; Max-Age=3600\r\nConnection: close\r\n\r\n{{}}").as_bytes()).await.unwrap();
                socket.shutdown().await.unwrap();
            }));
        }
        for responder in responders {
            responder.await.unwrap();
        }
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut buffer = [0u8; 2048];
        let length = socket.read(&mut buffer).await.unwrap();
        let request = String::from_utf8_lossy(&buffer[..length]).into_owned();
        socket
            .write_all(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}")
            .await
            .unwrap();
        request
    });
    let api = api::Api::with_cookies(&origin, CookieJar::memory(&origin).unwrap()).unwrap();
    let input = json!({"path":"/api/auth/get-session","method":"GET","headers":{}});
    let (first, second) = tokio::join!(api.request(input.clone()), api.request(input.clone()));
    first.unwrap();
    second.unwrap();
    api.request(input).await.unwrap();
    let observed = server.await.unwrap();
    assert!(observed.contains("better-auth.first=value"));
    assert!(observed.contains("better-auth.second=value"));
}

#[test]
fn legacy_session_cleanup_runs_only_once() {
    let temp = tempfile::tempdir().unwrap();
    let keys = Arc::new(MemoryKeys::default());
    fs::write(temp.path().join("session.enc"), "legacy ciphertext").unwrap();
    fs::write(
        temp.path().join("session.enc.corrupt-test"),
        "legacy quarantine",
    )
    .unwrap();
    CookieJar::open_with_keys(temp.path().into(), "https://api.example.test", keys.clone())
        .unwrap();
    assert!(!temp.path().join("session.enc").exists());
    assert!(!temp.path().join("session.enc.corrupt-test").exists());
    fs::write(
        temp.path().join("session.enc"),
        "created by an older installation",
    )
    .unwrap();
    CookieJar::open_with_keys(temp.path().into(), "https://api.example.test", keys).unwrap();
    assert_eq!(
        fs::read(temp.path().join("session.enc")).unwrap(),
        b"created by an older installation"
    );
}
