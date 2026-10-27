#![cfg(feature = "native-smoke")]
use raypx_desktop::smoke::cleanup_session_keys;
use std::{fs, path::PathBuf};

#[test]
fn session_teardown_visits_only_marked_native_scopes_in_the_owned_smoke_directory() {
    let temporary = tempfile::tempdir().unwrap();
    let directory = temporary.path();
    assert!(
        cleanup_session_keys(directory, |_| panic!("Unowned directory reached keyring")).is_err()
    );
    fs::write(
        directory.join(".native-smoke-session-owner"),
        "raypx-native-smoke-v1\n",
    )
    .unwrap();
    let scopes = ["a".repeat(32), "b".repeat(32)];
    for name in [
        &scopes[0],
        &scopes[1],
        &"c".repeat(32),
        &"unrelated".to_string(),
    ] {
        let server = directory.join("servers").join(name);
        fs::create_dir_all(&server).unwrap();
        if !name.starts_with('c') {
            fs::write(server.join("tauri-session-v2"), "2").unwrap();
        }
    }
    fs::write(directory.join("preferences.json"), "preserve").unwrap();
    let mut visited = Vec::<PathBuf>::new();
    assert_eq!(
        cleanup_session_keys(directory, |path| {
            visited.push(path.into());
            Ok(())
        })
        .unwrap(),
        2
    );
    visited.sort();
    assert_eq!(
        visited,
        scopes.map(|name| directory.join("servers").join(name))
    );
    assert_eq!(
        fs::read(directory.join("preferences.json")).unwrap(),
        b"preserve"
    );
    assert!(cleanup_session_keys(directory, |_| Err("keyring unavailable".into())).is_err());
}

#[cfg(unix)]
#[test]
fn session_teardown_never_follows_a_substituted_server_directory() {
    let temporary = tempfile::tempdir().unwrap();
    let directory = temporary.path();
    fs::write(
        directory.join(".native-smoke-session-owner"),
        "raypx-native-smoke-v1\n",
    )
    .unwrap();
    let outside = tempfile::tempdir().unwrap();
    std::os::unix::fs::symlink(outside.path(), directory.join("servers")).unwrap();
    assert!(cleanup_session_keys(directory, |_| panic!("Symlink reached keyring")).is_err());
}
