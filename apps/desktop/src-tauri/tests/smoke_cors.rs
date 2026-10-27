#![cfg(feature = "native-smoke")]
use raypx_desktop::smoke_cors::fixture_origin;
use serde_json::json;

#[test]
fn cors_probe_only_accepts_plain_http_loopback_origins() {
    for origin in [
        "http://127.0.0.1:1234",
        "http://localhost:2345",
        "http://[::1]:3456",
    ] {
        assert!(fixture_origin(&json!(origin)).is_ok(), "{origin}");
    }
    for origin in [
        "https://127.0.0.1:1234",
        "http://example.test:1234",
        "http://127.0.0.1.example.test:1234",
        "http://user:password@127.0.0.1:1234",
        "http://127.0.0.1:1234/path",
        "http://127.0.0.1:1234?query=1",
        "http://127.0.0.1:1234#fragment",
        "http://127.0.0.1:0",
        "http://local\nhost:1234",
        "file:///tmp/index.html",
    ] {
        assert!(fixture_origin(&json!(origin)).is_err(), "{origin}");
    }
    assert!(fixture_origin(&json!(null)).is_err());
    assert!(fixture_origin(&json!({"origin":"http://localhost"})).is_err());
}
