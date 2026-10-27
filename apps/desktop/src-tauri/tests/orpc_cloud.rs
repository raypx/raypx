use raypx_desktop::{api::Api, cookies::CookieJar};
use serde_json::{Value, json};
use std::{
    path::{Path, PathBuf},
    process::Stdio,
    time::Duration,
};
use tokio::io::{AsyncBufReadExt, BufReader};

async fn bun_binary(desktop: &Path) -> PathBuf {
    let executable = if cfg!(windows) { "bun.exe" } else { "bun" };
    let binary = match std::env::var_os("RAYPX_BUN") {
        Some(path) => {
            let path = PathBuf::from(path);
            assert!(
                path.is_absolute(),
                "RAYPX_BUN must name an absolute Bun executable"
            );
            path
        }
        None => std::env::split_paths(&std::env::var_os("PATH").unwrap_or_default())
            .map(|directory| directory.join(executable))
            .find(|candidate| candidate.is_file())
            .expect("Install the repository-pinned Bun on PATH or set absolute RAYPX_BUN"),
    };
    // Keep the final `bun` filename: runtime managers dispatch symlinked shims by argv[0].
    let binary = std::path::absolute(binary).expect("Unable to resolve the Bun executable");
    let package: Value =
        serde_json::from_slice(&std::fs::read(desktop.join("../../package.json")).unwrap())
            .unwrap();
    let pin = package["packageManager"]
        .as_str()
        .unwrap()
        .strip_prefix("bun@")
        .unwrap();
    let version = tokio::time::timeout(
        Duration::from_secs(5),
        tokio::process::Command::new(&binary)
            .arg("--version")
            .kill_on_drop(true)
            .output(),
    )
    .await
    .unwrap()
    .unwrap();
    assert!(version.status.success(), "Bun version probe failed");
    assert_eq!(
        String::from_utf8(version.stdout).unwrap().trim(),
        pin,
        "The oRPC fixture requires the repository-pinned Bun"
    );
    binary
}

#[tokio::test]
async fn rust_client_calls_actual_ts_orpc_2_through_the_native_cookie_transport() {
    let desktop = Path::new(env!("CARGO_MANIFEST_DIR")).parent().unwrap();
    let mut server = tokio::process::Command::new(bun_binary(desktop).await)
        .arg(desktop.join("tests/native/fixtures/orpc-server.ts"))
        .current_dir(desktop)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .kill_on_drop(true)
        .spawn()
        .expect("Bun is required for the oRPC wire compatibility fixture");
    let mut reader = BufReader::new(server.stdout.take().unwrap());
    let mut line = String::new();
    tokio::time::timeout(Duration::from_secs(10), reader.read_line(&mut line))
        .await
        .unwrap()
        .unwrap();
    let started: Value =
        serde_json::from_str(&line).expect("oRPC fixture must report its loopback origin");
    let origin = started["origin"].as_str().unwrap();
    let api = Api::with_cookies(origin, CookieJar::memory(origin).unwrap()).unwrap();

    let account = api.rpc("account/get", json!({})).await.unwrap();
    assert_eq!(account["id"], "fixture-account");
    assert_eq!(account["authenticated"], false);
    assert_eq!(
        api.rpc("account.get", json!({})).await.unwrap()["authenticated"],
        true
    );
    let authorization = api
        .rpc(
            "hosts/authorize",
            json!({"deviceId":"fixture-device","epoch":1}),
        )
        .await
        .unwrap();
    assert_eq!(
        authorization["credential"],
        "fixture-native-host-credential"
    );
    assert_eq!(authorization["deviceId"], "fixture-device");
    assert_eq!(
        api.rpc(
            "/rpc/hosts/revoke",
            json!({"credential":authorization["credential"]})
        )
        .await
        .unwrap()["revoked"],
        true
    );

    // The same credentials remain inaccessible to renderer requests and headers.
    assert_eq!(
        api.request(
            json!({"path":"/rpc/hosts/authorize","method":"POST","headers":{},"body":"{}"})
        )
        .await
        .unwrap_err(),
        "API path is not permitted"
    );
    let renderer = api.request(json!({"path":"/rpc/account/get","method":"POST","headers":{"content-type":"application/json"},"body":"{\"json\":{}}"})).await.unwrap();
    assert!(renderer["headers"].get("set-cookie").is_none());
    assert!(!renderer.to_string().contains("fixture-private-cookie"));
    assert!(
        !renderer
            .to_string()
            .contains("fixture-native-host-credential")
    );

    assert_eq!(
        api.rpc("account/get", json!({"mode":"unauthorized"}))
            .await
            .unwrap_err(),
        "AUTH_REQUIRED"
    );
    assert_eq!(
        api.rpc("account/get", json!({"mode":"not-found"}))
            .await
            .unwrap_err(),
        "NOT_FOUND"
    );
    assert_eq!(
        api.rpc("account/get", json!({"mode":"forged-error"}))
            .await
            .unwrap_err(),
        "Native API request failed"
    );
    assert_eq!(
        api.rpc("account/get", json!({"mode":"date"}))
            .await
            .unwrap_err(),
        "Unsupported native API serialization"
    );
    // Only an old plain HTTP 404 may select Control::attach's host.legacy branch.
    for (device_id, expected) in [
        ("unauthorized", "AUTH_REQUIRED"),
        ("not-found", "NOT_FOUND"),
        ("forbidden", "FORBIDDEN"),
        ("legacy", "MISSING_PROCEDURE"),
        ("redirect", "Invalid native API response"),
    ] {
        assert_eq!(
            api.rpc("hosts/authorize", json!({"deviceId":device_id,"epoch":1}))
                .await
                .unwrap_err(),
            expected
        );
    }
    server.kill().await.unwrap();
    server.wait().await.unwrap();
}
