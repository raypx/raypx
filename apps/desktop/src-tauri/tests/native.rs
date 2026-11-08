#[cfg(feature = "native-smoke")]
use raypx_desktop::engine::Engine;
use raypx_desktop::{
    config::{Config, Preferences},
    events::Events,
    sessions::{CookieJar, Instance, Sessions},
};
use serde_json::json;
use std::{
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio_util::sync::CancellationToken;
#[test]
fn config_origins_and_preferences_preserve_device_data() {
    let config = Config::parse("base_url='https://EXAMPLE.com:443'\nlocal_profile='work'\n[profiles.beta]\nbase_url='https://beta.example'\n").unwrap();
    assert_eq!(config.api, "https://example.com");
    assert_eq!(config.profile, "work");
    for source in [
        "base_url='https://user:pass@example.com'",
        "base_url='https://example.com/path'",
        "base_url='http://example.com'",
        "local_profile='../work'",
        "profile='missing'",
    ] {
        assert!(Config::parse(source).is_err());
    }
    let directory = tempfile::tempdir().unwrap();
    let preferences = Preferences::open(directory.path());
    assert_eq!(preferences.snapshot()["status"], "missing");
    assert!(preferences.save(json!({"theme":"dark","analytics":{"enabled":false}})));
    assert!(preferences.save(json!({"locale":"zh"})));
    let reopened = Preferences::open(directory.path());
    assert_eq!(reopened.snapshot()["raw"]["theme"], "dark");
    assert_eq!(reopened.snapshot()["raw"]["analytics"]["enabled"], false);
}
#[test]
fn cookie_storage_is_encrypted_and_origin_scoped_and_preserves_old_host_credentials() {
    let directory = tempfile::tempdir().unwrap();
    std::fs::write(
        directory.path().join("sessions.sqlite"),
        b"old host credentials",
    )
    .unwrap();
    let open = |scope| Sessions::with_key(directory.path(), scope, |_| Ok(vec![7; 32])).unwrap();
    let mut jar = CookieJar::open("https://example.com", open("a")).unwrap();
    jar.apply(&[
        "__Secure-better-auth.session_token=secret-token; Path=/; Secure; HttpOnly; Max-Age=3600"
            .into(),
    ])
    .unwrap();
    assert!(
        jar.header(&"https://example.com/api/auth/get-session".parse().unwrap())
            .unwrap()
            .contains("secret-token")
    );
    assert!(
        jar.header(&"https://other.example/".parse().unwrap())
            .is_err()
    );
    drop(jar);
    let jar = CookieJar::open("https://example.com", open("a")).unwrap();
    assert!(
        jar.header(&"https://example.com/".parse().unwrap())
            .unwrap()
            .contains("secret-token")
    );
    let other = CookieJar::open("https://other.example", open("b")).unwrap();
    assert!(
        other
            .header(&"https://other.example/".parse().unwrap())
            .unwrap()
            .is_empty()
    );
    let raw = std::fs::read(directory.path().join("tauri-sessions.sqlite")).unwrap();
    assert!(!raw.windows(12).any(|bytes| bytes == b"secret-token"));
    assert_eq!(
        std::fs::read(directory.path().join("sessions.sqlite")).unwrap(),
        b"old host credentials"
    );
}
#[cfg(feature = "native-smoke")]
#[test]
fn isolated_smoke_session_key_survives_reopen_without_os_keyring() {
    let directory = tempfile::tempdir().unwrap();
    let mut first = CookieJar::open(
        "https://example.com",
        Sessions::open(directory.path(), "smoke").unwrap(),
    )
    .unwrap();
    first
        .apply(&["__Secure-better-auth.session_token=smoke-token; Path=/; Secure; HttpOnly; Max-Age=3600".into()])
        .unwrap();
    drop(first);

    let reopened = CookieJar::open(
        "https://example.com",
        Sessions::open(directory.path(), "smoke").unwrap(),
    )
    .unwrap();
    assert!(
        reopened
            .header(&"https://example.com/".parse().unwrap())
            .unwrap()
            .contains("smoke-token")
    );
}
#[test]
fn instance_lock_cannot_be_opened_twice_and_is_released_without_unlinking() {
    let directory = tempfile::tempdir().unwrap();
    let first = Instance::acquire(directory.path()).unwrap();
    assert!(Instance::acquire(directory.path()).is_err());
    drop(first);
    assert!(directory.path().join("desktop-instance.sqlite").exists());
    assert!(Instance::acquire(directory.path()).is_ok());
}
#[tokio::test]
async fn event_credit_blocks_and_cumulative_ack_releases_only_the_current_subscription() {
    let events = Arc::new(Events::default());
    let packets = Arc::new(Mutex::new(vec![]));
    let capture = packets.clone();
    let generation = events
        .subscribe(Arc::new(move |packet| {
            capture.lock().unwrap().push(packet);
            Ok(())
        }))
        .unwrap();
    let cancel = CancellationToken::new();
    events
        .send(json!({"value":"x".repeat(800_000)}), &cancel)
        .await
        .unwrap();
    let blocked = events.send(json!({"value":"x".repeat(800_000)}), &cancel);
    tokio::pin!(blocked);
    assert!(
        tokio::time::timeout(Duration::from_millis(25), &mut blocked)
            .await
            .is_err()
    );
    assert!(!events.acknowledge(generation + 1, 1));
    assert!(events.acknowledge(generation, 1));
    blocked.await.unwrap();
    assert_eq!(packets.lock().unwrap().len(), 3);
    assert!(!events.acknowledge(generation, 999));
}
#[cfg(feature = "native-smoke")]
#[tokio::test]
async fn real_cli_transport_frames_concurrent_requests_and_closes_only_its_child() {
    let binary = std::path::PathBuf::from(env!("CARGO_BIN_EXE_raypx-native-fixture"));
    let engine = Engine::new(
        binary,
        vec![],
        "0.1.0".into(),
        42,
        true,
        Arc::new(Events::default()),
    );
    assert!(engine.start(false).await.unwrap());
    let (a, b) = tokio::join!(
        engine.request("roots.list", json!({"key":"one"})),
        engine.request("roots.list", json!({"key":"two"}))
    );
    assert_eq!(a.unwrap()["key"], "one");
    assert_eq!(b.unwrap()["key"], "two");
    engine.close().await;
    assert!(engine.request("runtime.info", json!({})).await.is_err());
}

#[cfg(feature = "native-smoke")]
#[tokio::test]
async fn transport_rejects_mismatched_builds_and_unterminated_frames() {
    for mode in ["different-build", "partial-line"] {
        let engine = Engine::new(
            env!("CARGO_BIN_EXE_raypx-native-fixture").into(),
            vec![mode.into()],
            "0.1.0".into(),
            43,
            true,
            Arc::new(Events::default()),
        );
        assert!(!engine.start(false).await.unwrap());
        assert_ne!(engine.status()["status"], "ready");
        engine.close().await;
    }
}

#[cfg(feature = "native-smoke")]
#[tokio::test]
async fn close_is_bounded_when_a_child_stops_reading_its_input() {
    let engine = Engine::new(
        env!("CARGO_BIN_EXE_raypx-native-fixture").into(),
        vec!["stalled-reader".into()],
        "0.1.0".into(),
        42,
        true,
        Arc::new(Events::default()),
    );
    assert!(engine.start(false).await.unwrap());
    let pending = engine.request("roots.list", json!({"value":"x".repeat(4_000_000)}));
    tokio::pin!(pending);
    assert!(
        tokio::time::timeout(Duration::from_millis(100), &mut pending)
            .await
            .is_err()
    );
    tokio::time::timeout(Duration::from_secs(6), engine.close())
        .await
        .unwrap();
    assert!(pending.await.is_err());
}

#[cfg(feature = "native-smoke")]
#[tokio::test]
async fn bundled_cli_survives_gui_transport_shutdown_with_the_same_daemon() {
    let Some(binary) = std::env::var_os("RAYPX_TAURI_CLI") else {
        return;
    };
    let binary = std::path::PathBuf::from(binary).canonicalize().unwrap();
    let manifest: serde_json::Value = serde_json::from_slice(
        &std::fs::read(binary.parent().unwrap().join("runtime.json")).unwrap(),
    )
    .unwrap();
    let directory = tempfile::tempdir().unwrap();
    raypx_desktop::config::protect(directory.path()).unwrap();
    let args = vec![
        "--data-dir".into(),
        directory.path().to_string_lossy().into_owned(),
        "--profile".into(),
        "native-test".into(),
    ];
    let open = || {
        Engine::new(
            binary.clone(),
            args.clone(),
            manifest["version"].as_str().unwrap().into(),
            manifest["builtAt"].as_u64().unwrap(),
            true,
            Arc::new(Events::default()),
        )
    };
    let first = open();
    assert!(first.start(false).await.unwrap());
    let before = first.request("runtime.info", json!({})).await.unwrap();
    assert_eq!(before["owner"], "daemon");
    first.close().await;
    let second = open();
    assert!(second.start(false).await.unwrap());
    let after = second.request("runtime.info", json!({})).await.unwrap();
    assert_eq!(before, after);
    second.close().await;
    let status = tokio::process::Command::new(&binary)
        .args(["daemon", "stop"])
        .args(args)
        .status()
        .await
        .unwrap();
    assert!(status.success());
}

#[cfg(windows)]
#[test]
fn private_files_replace_existing_acl_with_only_current_user_and_system() {
    let directory = tempfile::tempdir().unwrap();
    let file = directory.path().join("private.txt");
    std::fs::write(&file, "synthetic").unwrap();
    raypx_desktop::config::protect(directory.path()).unwrap();
    raypx_desktop::config::protect(&file).unwrap();
    let status = std::process::Command::new("powershell.exe")
        .args(["-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop'; $a=Get-Acl -LiteralPath $env:RAYPX_ACL_TEST; if(-not $a.AreAccessRulesProtected){exit 1}; $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value; $rules=@($a.GetAccessRules($true,$true,[System.Security.Principal.SecurityIdentifier])); if($rules.Count -ne 2){exit 2}; foreach($r in $rules){if($r.IdentityReference.Value -notin @($sid,'S-1-5-18')){exit 3}}"])
        .env("RAYPX_ACL_TEST", file).status().unwrap();
    assert!(status.success());
}
#[cfg(feature = "native-smoke")]
#[test]
fn sqlite_lock_arbitrates_between_real_processes() {
    use std::io::{BufRead, BufReader, Write};
    let directory = tempfile::tempdir().unwrap();
    let mut child = std::process::Command::new(env!("CARGO_BIN_EXE_raypx-native-fixture"))
        .arg("lock")
        .arg(directory.path())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    let mut line = String::new();
    BufReader::new(child.stdout.take().unwrap())
        .read_line(&mut line)
        .unwrap();
    assert_eq!(line, "locked\n");
    assert!(Instance::acquire(directory.path()).is_err());
    child.stdin.take().unwrap().write_all(b"stop\n").unwrap();
    assert!(child.wait().unwrap().success());
    assert!(Instance::acquire(directory.path()).is_ok());
}

#[test]
fn connection_fixtures_keep_the_accepted_configuration_contract() {
    let rows: Vec<serde_json::Value> =
        serde_json::from_str(include_str!("../../tests/fixtures/native/config.json")).unwrap();
    for row in rows {
        let result = Config::parse(row["source"].as_str().unwrap());
        if row["invalid"] == true {
            assert!(result.is_err(), "{}", row["name"]);
            continue;
        }
        let config = result.unwrap();
        assert_eq!(config.api, row["expected"]["apiUrl"]);
        assert_eq!(config.web, row["expected"]["webUrl"]);
    }
}

#[test]
fn renderer_policy_keeps_native_authorization_and_device_scope_private() {
    let directory = tempfile::tempdir().unwrap();
    let resources = tempfile::tempdir().unwrap();
    std::fs::write(
        resources.path().join("runtime.json"),
        br#"{"format":1,"version":"0.1.0","builtAt":42}"#,
    )
    .unwrap();
    let host = raypx_desktop::host::Host::open(
        Config::parse("").unwrap(),
        directory.path().into(),
        resources.path().join("raypx"),
    )
    .unwrap();
    let methods: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../tests/fixtures/native/local-methods.json"
    ))
    .unwrap();
    for row in methods {
        assert_eq!(
            host.renderer_params(row["method"].as_str().unwrap(), json!({}))
                .is_ok(),
            row["allowed"] == true,
            "{}",
            row
        );
    }
    let scopes: Vec<serde_json::Value> = serde_json::from_str(include_str!(
        "../../tests/fixtures/native/account-scopes.json"
    ))
    .unwrap();
    for row in scopes {
        let result = host.renderer_params("agents.local.list", row["input"].clone());
        if row["invalid"] == true {
            assert!(result.is_err());
        } else {
            assert_eq!(result.unwrap(), row["expected"]);
        }
    }
    let input = json!({"origin":"https://other.invalid"});
    assert_eq!(
        host.renderer_params("instance.begin", input.clone())
            .unwrap()["origin"],
        "https://raypx.com"
    );
    assert_eq!(input["origin"], "https://other.invalid");
}

#[test]
fn page_origins_and_external_links_reject_foreign_views_and_credentials() {
    use raypx_desktop::host::{external_url, trusted_url};
    let scope = "abcdef0123456789abcdef0123456789";
    for path in ["/", "/index.html?view=tasks#/tasks"] {
        assert!(trusted_url(
            &format!("raypx-{scope}://localhost{path}").parse().unwrap(),
            scope
        ));
    }
    for raw in [
        "https://evil.invalid",
        "raypx-other://localhost/",
        "raypx-abcdef0123456789abcdef0123456789://user@localhost/",
        "raypx-abcdef0123456789abcdef0123456789://localhost:80/",
    ] {
        assert!(!trusted_url(&raw.parse().unwrap(), scope));
    }
    for raw in [
        "file:///private/data",
        "javascript:alert(1)",
        "https://user:secret@example.com",
        "https://example.com\n",
    ] {
        assert!(external_url(raw).is_err());
    }
}

#[test]
fn cookie_policy_matches_existing_fixtures_and_path_boundaries() {
    let directory = tempfile::tempdir().unwrap();
    let rows: Vec<serde_json::Value> =
        serde_json::from_str(include_str!("../../tests/fixtures/native/cookies.json")).unwrap();
    for (index, row) in rows.iter().enumerate() {
        let mut jar = CookieJar::open(
            "https://api.example.test",
            Sessions::with_key(directory.path(), &index.to_string(), |_| Ok(vec![4; 32])).unwrap(),
        )
        .unwrap();
        let result = jar.apply(&[row["raw"].as_str().unwrap().into()]);
        if row["outcome"] == "error" {
            assert!(result.is_err(), "{}", row);
        } else {
            result.unwrap();
            let header = jar
                .header(&"https://api.example.test/rpc/tasks/list".parse().unwrap())
                .unwrap();
            assert_eq!(!header.is_empty(), row["outcome"] == "set", "{}", row);
        }
    }
    let mut jar = CookieJar::open(
        "https://api.example.test",
        Sessions::with_key(directory.path(), "path", |_| Ok(vec![4; 32])).unwrap(),
    )
    .unwrap();
    jar.apply(&["better-auth.session_token=value; Path=/api/auth; Secure; HttpOnly".into()])
        .unwrap();
    assert!(
        jar.header(&"https://api.example.test/api/authentic".parse().unwrap())
            .unwrap()
            .is_empty()
    );
    assert!(
        !jar.header(
            &"https://api.example.test/api/auth/get-session"
                .parse()
                .unwrap()
        )
        .unwrap()
        .is_empty()
    );
}

#[test]
fn missing_key_and_corrupt_ciphertext_preserve_durable_sessions() {
    let directory = tempfile::tempdir().unwrap();
    let store = Sessions::with_key(directory.path(), "a", |_| Ok(vec![7; 32])).unwrap();
    let mut jar = CookieJar::open("https://example.com", store).unwrap();
    jar.apply(&[
        "better-auth.session_token=synthetic; Path=/; Secure; HttpOnly; Max-Age=3600".into(),
    ])
    .unwrap();
    drop(jar);
    let connection =
        rusqlite::Connection::open(directory.path().join("tauri-sessions.sqlite")).unwrap();
    let original: Vec<u8> = connection
        .query_row("SELECT cookies FROM sessions WHERE scope='a'", [], |r| {
            r.get(0)
        })
        .unwrap();
    let lost = Sessions::with_key(directory.path(), "a", |create| {
        assert!(!create);
        Err("KEY_LOST".into())
    })
    .unwrap();
    let mut jar = CookieJar::open("https://example.com", lost).unwrap();
    jar.apply(&[
        "better-auth.session_token=temporary; Path=/; Secure; HttpOnly; Max-Age=3600".into(),
    ])
    .unwrap();
    drop(jar);
    let after: Vec<u8> = connection
        .query_row("SELECT cookies FROM sessions WHERE scope='a'", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(original, after);
    let mut tampered = original.clone();
    tampered[20] ^= 1;
    connection
        .execute("UPDATE sessions SET cookies=? WHERE scope='a'", [&tampered])
        .unwrap();
    let store = Sessions::with_key(directory.path(), "a", |_| Ok(vec![7; 32])).unwrap();
    let jar = CookieJar::open("https://example.com", store).unwrap();
    assert!(
        jar.header(&"https://example.com/".parse().unwrap())
            .unwrap()
            .is_empty()
    );
    drop(jar);
    let after: Vec<u8> = connection
        .query_row("SELECT cookies FROM sessions WHERE scope='a'", [], |r| {
            r.get(0)
        })
        .unwrap();
    assert_eq!(tampered, after);
}

#[tokio::test]
async fn stale_unsubscribe_cannot_disconnect_the_reloaded_renderer() {
    let events = Events::default();
    let first = events.subscribe(Arc::new(|_| Ok(()))).unwrap();
    let received = Arc::new(Mutex::new(vec![]));
    let capture = received.clone();
    let current = events
        .subscribe(Arc::new(move |packet| {
            capture.lock().unwrap().push(packet);
            Ok(())
        }))
        .unwrap();
    events.unsubscribe(first);
    events
        .send(json!({"event":"reload"}), &CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(received.lock().unwrap().len(), 2);
    events.unsubscribe(current);
    events
        .send(json!({"event":"closed"}), &CancellationToken::new())
        .await
        .unwrap();
    assert_eq!(received.lock().unwrap().len(), 2);
}

#[tokio::test]
async fn native_http_uses_the_real_typescript_orpc_envelope_without_exposing_credentials() {
    use raypx_desktop::api::Api;
    use tokio::{
        io::{AsyncBufReadExt, BufReader},
        process::Command,
    };
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let mut server = Command::new("bun")
        .arg(root.join("apps/desktop/tests/native/fixtures/orpc-server.ts"))
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::inherit())
        .kill_on_drop(true)
        .spawn()
        .unwrap();
    let mut line = String::new();
    tokio::time::timeout(
        Duration::from_secs(10),
        BufReader::new(server.stdout.take().unwrap()).read_line(&mut line),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(
        !line.is_empty(),
        "The TypeScript API fixture exited before becoming ready"
    );
    let origin = serde_json::from_str::<serde_json::Value>(&line).unwrap()["origin"]
        .as_str()
        .unwrap()
        .to_owned();
    let directory = tempfile::tempdir().unwrap();
    let jar = CookieJar::open(
        &origin,
        Sessions::with_key(directory.path(), "orpc", |_| Ok(vec![7; 32])).unwrap(),
    )
    .unwrap();
    let api = Api::new(&origin, jar, CancellationToken::new()).unwrap();
    assert_eq!(
        api.rpc("account.get", json!({})).await.unwrap()["authenticated"],
        false
    );
    assert_eq!(
        api.rpc("account.get", json!({})).await.unwrap()["authenticated"],
        true
    );
    let grant = api
        .rpc("hosts.authorize", json!({"deviceId":"synthetic","epoch":1}))
        .await
        .unwrap();
    assert_eq!(grant["credential"], "fixture-native-host-credential");
    assert_eq!(
        api.rpc("hosts.revoke", grant).await.unwrap()["revoked"],
        true
    );
    for (input, code) in [
        ("unauthorized", "AUTH_REQUIRED"),
        ("not-found", "NOT_FOUND"),
        ("forbidden", "FORBIDDEN"),
        ("legacy", "MISSING_PROCEDURE"),
        ("redirect", "INVALID_API_RESPONSE"),
    ] {
        assert_eq!(
            api.rpc("hosts.authorize", json!({"deviceId":input}))
                .await
                .unwrap_err()
                .0,
            code
        );
    }
    assert_eq!(
        api.rpc("account.get", json!({"mode":"date"}))
            .await
            .unwrap_err()
            .0,
        "INVALID_API_SERIALIZATION"
    );
    assert!(
        api.request(
            json!({"path":"/rpc/hosts/authorize","method":"POST","headers":{},"body":"{}"}),
            false
        )
        .await
        .is_err()
    );
    let response = api
        .request(
            json!({"path":"/rpc/account/get","method":"POST","headers":{},"body":"{\"json\":{}}"}),
            false,
        )
        .await
        .unwrap();
    assert!(
        !response["headers"]
            .as_object()
            .unwrap()
            .contains_key("set-cookie")
    );
    server.kill().await.unwrap();
    let _ = server.wait().await;
}

#[test]
fn actual_preload_preserves_json_keys_and_freezes_preferences_without_prototype_pollution() {
    use std::io::Write;
    let directory = tempfile::tempdir().unwrap();
    let resources = tempfile::tempdir().unwrap();
    std::fs::write(
        resources.path().join("runtime.json"),
        br#"{"format":1,"version":"0.1.0","builtAt":42}"#,
    )
    .unwrap();
    std::fs::write(directory.path().join("preferences.json"),br#"{"theme":"dark","locale":"zh","__proto__":{"polluted":true},"nested":{"__proto__":{"polluted":true}}}"#).unwrap();
    let host = raypx_desktop::host::Host::open(
        Config::parse("").unwrap(),
        directory.path().into(),
        resources.path().join("raypx"),
    )
    .unwrap();
    let root = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../..");
    let mut child = std::process::Command::new("bun")
        .arg(root.join("apps/desktop/tests/native/fixtures/preferences-preload.ts"))
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .spawn()
        .unwrap();
    child
        .stdin
        .take()
        .unwrap()
        .write_all(json!({"script":host.preload()}).to_string().as_bytes())
        .unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(output.status.success());
    let value: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    for field in [
        "ownProto",
        "prototypeUnchanged",
        "globalsClean",
        "deepFrozen",
        "valid",
    ] {
        assert_eq!(value[field], true, "{}", field);
    }
    assert_eq!(value["inheritedPollution"], false);
}
