use raypx_desktop::{
    DESKTOP_COMMANDS,
    engine::{Engine, EventStream, LINE_LIMIT},
};
use serde_json::{Value, json};
use std::{collections::BTreeSet, path::PathBuf, sync::Arc, time::Duration};
use tauri::ipc::{Channel, InvokeResponseBody};
use tokio_util::sync::CancellationToken;

#[test]
fn registered_commands_match_ts_contract_and_capability() {
    let methods: Value =
        serde_json::from_str(include_str!("../generated/desktop-methods.json")).unwrap();
    let mut expected: BTreeSet<String> = methods
        .as_object()
        .unwrap()
        .values()
        .map(|value| value.as_str().unwrap().to_owned())
        .collect();
    expected.extend([
        "subscribe_local_events".to_owned(),
        "ack_local_events".to_owned(),
    ]);
    assert_eq!(
        expected,
        DESKTOP_COMMANDS
            .iter()
            .map(|command| (*command).to_owned())
            .collect()
    );
    let permissions: toml::Value =
        toml::from_str(include_str!("../permissions/desktop.toml")).unwrap();
    let actual: BTreeSet<String> = permissions["permission"][0]["commands"]["allow"]
        .as_array()
        .unwrap()
        .iter()
        .map(|command| command.as_str().unwrap().to_owned())
        .collect();
    assert_eq!(expected, actual);
    let capabilities: Value =
        serde_json::from_str(include_str!("../capabilities/main.json")).unwrap();
    assert_eq!(capabilities["permissions"], json!(["allow-desktop"]));
    assert!(capabilities.get("remote").is_none());
}
fn sequence(body: InvokeResponseBody) -> u64 {
    match body {
        InvokeResponseBody::Json(raw) => serde_json::from_str::<Value>(&raw).unwrap()["sequence"]
            .as_u64()
            .unwrap(),
        _ => panic!("Expected JSON event"),
    }
}
#[tokio::test]
async fn stalled_renderer_stops_child_event_flow_until_ack() {
    let events = Arc::new(EventStream::default());
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel();
    events.subscribe(Channel::new(move |body| {
        tx.send(sequence(body)).unwrap();
        Ok(())
    }));
    let event = json!({"version":1,"event":"terminal.output","data":{"data":"a".repeat(300*1024)}});
    let cancelled = CancellationToken::new();
    for _ in 0..3 {
        events.send(event.clone(), &cancelled).await.unwrap();
    }
    let first = rx.recv().await.unwrap();
    let second = rx.recv().await.unwrap();
    let third = rx.recv().await.unwrap();
    assert_eq!([first, second, third], [1, 2, 3]);
    assert!(!events.acknowledge(999));
    assert!(
        tokio::time::timeout(
            Duration::from_millis(25),
            events.send(event.clone(), &cancelled)
        )
        .await
        .is_err()
    );
    assert!(rx.try_recv().is_err());
    assert!(events.acknowledge(first));
    events.send(event, &cancelled).await.unwrap();
    assert_eq!(rx.recv().await.unwrap(), 4);
}
#[tokio::test]
async fn channel_keeps_order_and_credit_at_terminal_throughput() {
    let events = Arc::new(EventStream::default());
    let (tx, mut rx) = tokio::sync::mpsc::channel(64);
    events.subscribe(Channel::new(move |body| {
        tx.try_send(sequence(body)).unwrap();
        Ok(())
    }));
    let consumer_events = events.clone();
    let consumer = tokio::spawn(async move {
        for expected in 1..=640 {
            let sequence = rx.recv().await.unwrap();
            assert_eq!(sequence, expected);
            consumer_events.acknowledge(sequence);
        }
    });
    let cancelled = CancellationToken::new();
    let event = json!({"version":1,"event":"terminal.output","data":{"data":"a".repeat(32*1024)}});
    // 20 MiB at 10 MiB/s. A burst also verifies the credit window, not only steady-state delivery.
    let mut pacing = tokio::time::interval(Duration::from_micros(3125));
    for _ in 0..640 {
        pacing.tick().await;
        events.send(event.clone(), &cancelled).await.unwrap();
    }
    consumer.await.unwrap();
    assert!(
        events
            .send(json!({"data":"a".repeat(LINE_LIMIT)}), &cancelled)
            .await
            .is_err()
    );
}
#[tokio::test]
async fn real_bundled_cli_handshake_requests_and_restart() {
    let binary = std::env::var_os("RAYPX_NATIVE_TEST_CLI")
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(format!(
                "binaries/raypx-{}{}",
                env!("RAYPX_TARGET_TRIPLE"),
                if cfg!(windows) { ".exe" } else { "" }
            ))
        });
    assert!(
        binary.is_file(),
        "Stage the bundled CLI with native:cli before Cargo tests"
    );
    let directory = tempfile::tempdir().unwrap();
    let engine = Engine::new(
        binary,
        env!("CARGO_PKG_VERSION").to_owned(),
        vec![
            "--profile".to_owned(),
            "tauri-runtime-test".to_owned(),
            "--data-dir".to_owned(),
            directory.path().to_string_lossy().into_owned(),
        ],
        false,
        Arc::new(EventStream::default()),
    );
    assert!(engine.start().await, "{}", engine.status());
    let info = engine.request("runtime.info", json!({})).await.unwrap();
    assert_eq!(info["version"], env!("CARGO_PKG_VERSION"));
    let roots = engine.request("roots.list", json!({})).await.unwrap();
    assert_eq!(roots, json!([]));
    engine.stop().await;
    assert!(engine.request("runtime.info", json!({})).await.is_err());
    assert!(engine.start().await, "{}", engine.status());
    engine.stop().await;
}

#[cfg(all(feature = "native-smoke", unix))]
#[test]
fn smoke_listener_initializes_on_the_native_setup_thread() {
    use std::os::unix::{fs::PermissionsExt, net::UnixStream};
    let directory = tempfile::tempdir().unwrap();
    let endpoint = directory.path().join("acceptance.sock");
    let listener = raypx_desktop::smoke::bind_local_socket(&endpoint).unwrap();
    assert_eq!(
        std::fs::metadata(&endpoint).unwrap().permissions().mode() & 0o777,
        0o600
    );
    let _client = UnixStream::connect(&endpoint).unwrap();
    assert!(raypx_desktop::smoke::bind_local_socket(&endpoint).is_err());
    drop(listener);
}
#[cfg(all(feature = "native-smoke", windows))]
#[test]
fn smoke_listener_initializes_on_the_native_setup_thread() {
    let endpoint = format!(r"\\.\pipe\raypx-native-smoke-test-{}", uuid::Uuid::new_v4());
    let _listener = raypx_desktop::smoke::bind_local_pipe(&endpoint).unwrap();
    assert!(raypx_desktop::smoke::bind_local_pipe(&endpoint).is_err());
}

#[test]
fn updater_has_a_deserializable_safe_config_without_release_credentials() {
    let config: Value = serde_json::from_str(include_str!("../tauri.conf.json")).unwrap();
    let updater: tauri_plugin_updater::Config =
        serde_json::from_value(config["plugins"]["updater"].clone()).unwrap();
    assert!(updater.require_signed_version);
    assert!(!updater.dangerous_insecure_transport_protocol);
    assert!(!updater.dangerous_accept_invalid_certs);
    assert!(!updater.allow_downgrades);
    assert!(updater.pubkey.is_empty());
    assert!(updater.endpoints.is_empty());
}

#[cfg(feature = "native-smoke")]
#[test]
fn smoke_stream_measures_the_actual_renderer_consumer_after_sdk_ordering() {
    let observer = raypx_desktop::smoke::stream_observer_script("regression-stream");
    let renderer = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src/lib/desktop.ts");
    let script = r#"
import assert from "node:assert/strict";
const callbacks=new Map();let nextId=0,channel;
const acknowledgements=[];
globalThis.window={__TAURI_INTERNALS__:{callbacks,transformCallback(callback){const id=++nextId;callbacks.set(id,callback);return id;},unregisterCallback(id){callbacks.delete(id);},invoke(command,input){if(command==='subscribe_local_events'){channel=input.channel;return Promise.resolve(true);}if(command==='ack_local_events'){acknowledgements.push(input.input.sequence);return Promise.resolve(true);}throw new Error(command);}}};
Object.defineProperty(window.__TAURI_INTERNALS__,'runCallback',{value(id,value){callbacks.get(id)?.(value);}});
const {getBridge,onLocalEvent}=await import(__RENDERER__);
await getBridge();
const observed=[];onLocalEvent(event=>observed.push(event.data.streamIndex));
__OBSERVER__;
const receive=index=>callbacks.get(channel.id)({index,message:{sequence:index+1,event:{version:1,event:'terminal.output',data:{terminalId:'none',nativeSmokeStream:'regression-stream',streamIndex:index,rawBytes:32,data:btoa('x'.repeat(32))}}}});
receive(2);
assert.equal(window.__raypxSmokeStreamStats.count,0,'A queued SDK packet must not count as consumed');
receive(0);receive(1);
assert.deepEqual(observed,[0,1,2]);assert.deepEqual(acknowledgements,[1,2,3]);
const stats=window.__raypxSmokeStreamStats;
assert.equal(stats.rawReceived,3);assert.equal(stats.count,3);assert.equal(stats.bytes,96);assert.equal(stats.ordered,true);assert.equal(stats.intact,true);
window.__raypxSmokeStreamRestore();
console.log(JSON.stringify({count:stats.count,bytes:stats.bytes,ordered:stats.ordered,intact:stats.intact}));
"#;
    let script = script
        .replace("__RENDERER__", &serde_json::to_string(&renderer).unwrap())
        .replace("__OBSERVER__", &observer);
    let directory = tempfile::tempdir().unwrap();
    let file = directory.path().join("stream-consumer.mjs");
    std::fs::write(&file, script).unwrap();
    let output = std::process::Command::new("bun")
        .arg(file)
        .output()
        .unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );
    let stats: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(
        stats,
        json!({"count":3,"bytes":96,"ordered":true,"intact":true})
    );
}
