use crate::{Result, fail};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
};
use url::Url;

pub fn digest(value: &str) -> String {
    format!("{:x}", Sha256::digest(value.as_bytes()))
}
pub fn origin(raw: &str) -> Result<String> {
    if !(raw.starts_with("https://") || raw.starts_with("http://"))
        || raw.encode_utf16().count() > 2048
        || raw
            .chars()
            .any(|c| c <= ' ' || c == '\u{7f}' || c == '\\' || c == '#')
    {
        return fail("INVALID_ORIGIN");
    }
    let url = Url::parse(raw)?;
    let loopback = matches!(
        url.host_str(),
        Some("localhost" | "127.0.0.1" | "[::1]" | "::1")
    );
    if url.host_str().is_none()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.query().is_some()
        || url.fragment().is_some()
        || url.path() != "/"
        || (url.scheme() != "https" && !(loopback && url.scheme() == "http"))
    {
        return fail("INVALID_ORIGIN");
    }
    Ok(url.origin().ascii_serialization())
}
#[derive(Clone)]
pub struct Config {
    pub api: String,
    pub web: String,
    pub scope: String,
    pub profile: String,
    pub directories: Value,
}
fn profile_name(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.as_bytes()[0].is_ascii_alphanumeric()
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}
impl Config {
    pub fn parse(source: &str) -> Result<Self> {
        if source.len() > 16 * 1024 {
            return fail("INVALID_CONFIG");
        }
        let table: toml::Table = toml::from_str(source)?;
        if table.keys().any(|key| {
            ![
                "base_url",
                "web_url",
                "profile",
                "profiles",
                "local_profile",
                "ai",
                "connectors",
            ]
            .contains(&key.as_str())
        }) {
            return fail("INVALID_CONFIG");
        }
        let endpoint = |table: &toml::Table, name: &str| -> Result<Option<String>> {
            table
                .get(name)
                .map(|value| {
                    value
                        .as_str()
                        .ok_or_else(|| crate::Error::from("INVALID_CONFIG"))
                        .and_then(origin)
                })
                .transpose()
        };
        let mut api = endpoint(&table, "base_url")?.unwrap_or_else(|| "https://raypx.com".into());
        let mut web = endpoint(&table, "web_url")?;
        if table.get("ai").is_some_and(|value| !value.is_table()) {
            return fail("INVALID_CONFIG");
        }
        let mut profiles = std::collections::HashMap::new();
        if let Some(value) = table.get("profiles") {
            for (name, value) in value.as_table().ok_or("INVALID_CONFIG")? {
                let value = value.as_table().ok_or("INVALID_CONFIG")?;
                if !profile_name(name)
                    || value
                        .keys()
                        .any(|key| key != "base_url" && key != "web_url")
                {
                    return fail("INVALID_CONFIG");
                }
                profiles.insert(
                    name.clone(),
                    (endpoint(value, "base_url")?, endpoint(value, "web_url")?),
                );
            }
        }
        if let Some(selected) = table.get("profile") {
            let (a, w) = profiles
                .get(selected.as_str().ok_or("INVALID_CONFIG")?)
                .ok_or("INVALID_CONFIG")?;
            if let Some(a) = a {
                api = a.clone();
                if w.is_none() {
                    web = Some(a.clone());
                }
            }
            if let Some(w) = w {
                web = Some(w.clone());
            }
        }
        let profile = table
            .get("local_profile")
            .map(|v| v.as_str().ok_or("INVALID_CONFIG"))
            .transpose()?
            .unwrap_or("default")
            .to_string();
        if !profile_name(&profile) {
            return fail("INVALID_CONFIG");
        }
        let mut directories = json!({});
        if let Some(values) = table.get("connectors") {
            for (key, value) in values.as_table().ok_or("INVALID_CONFIG")? {
                let provider = match key.as_str() {
                    "claude_config_dir" => "claude",
                    "codex_home" => "codex",
                    _ => return fail("INVALID_CONFIG"),
                };
                let path = value.as_str().ok_or("INVALID_CONFIG")?;
                if !Path::new(path).is_absolute() {
                    return fail("INVALID_CONFIG");
                }
                directories[provider] = json!(path);
            }
        }
        for (provider, key) in [("claude", "CLAUDE_CONFIG_DIR"), ("codex", "CODEX_HOME")] {
            if directories.get(provider).is_none()
                && let Ok(value) = std::env::var(key)
                && Path::new(&value).is_absolute()
            {
                directories[provider] = json!(value);
            }
        }
        Ok(Self {
            scope: digest(&api)[..32].into(),
            web: web.unwrap_or_else(|| api.clone()),
            api,
            profile,
            directories,
        })
    }
    pub fn load() -> Result<Self> {
        #[cfg(feature = "native-smoke")]
        validate_smoke()?;
        let home = std::env::var_os("RAYPX_HOME")
            .map(PathBuf::from)
            .unwrap_or(home()?.join(".raypx"));
        if !home.is_absolute() {
            return fail("INVALID_CONFIG_PATH");
        }
        private_directory(&home)?;
        let file = home.join("config.toml");
        if !file.exists() {
            atomic_write(
                &file,
                b"# Raypx desktop connection\nbase_url = \"https://raypx.com\"\n",
            )?;
        }
        Self::parse(
            std::str::from_utf8(&bounded_read(&file, 16 * 1024)?).map_err(|_| "INVALID_CONFIG")?,
        )
    }
}
pub fn home() -> Result<PathBuf> {
    std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
        .map(PathBuf::from)
        .ok_or_else(|| "HOME_UNAVAILABLE".into())
}
pub fn data_directory() -> Result<PathBuf> {
    #[cfg(feature = "native-smoke")]
    {
        validate_smoke()
    }
    #[cfg(not(feature = "native-smoke"))]
    {
        let identifier = if cfg!(feature = "native-smoke") {
            "com.raypx.desktop.native-smoke"
        } else if cfg!(debug_assertions) {
            "com.raypx.desktop.dev"
        } else {
            "com.raypx.desktop"
        };
        if let Some(path) = std::env::var_os("RAYPX_DESKTOP_DATA_DIR") {
            let path = PathBuf::from(path);
            if !path.is_absolute() {
                return fail("INVALID_DATA_PATH");
            }
            return Ok(path);
        }
        let base = if cfg!(windows) {
            PathBuf::from(std::env::var_os("LOCALAPPDATA").ok_or("DATA_PATH_UNAVAILABLE")?)
        } else if cfg!(target_os = "macos") {
            home()?.join("Library/Application Support")
        } else {
            std::env::var_os("XDG_DATA_HOME")
                .map(PathBuf::from)
                .unwrap_or(home()?.join(".local/share"))
        };
        Ok(base.join(identifier).join("stable"))
    }
}
pub fn protect(path: &Path) -> Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !(metadata.is_dir() || metadata.is_file()) {
        return fail("INVALID_PRIVATE_PATH");
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(
            path,
            fs::Permissions::from_mode(if metadata.is_dir() { 0o700 } else { 0o600 }),
        )?;
    }
    #[cfg(windows)]
    crate::permissions::protect(path, metadata.is_dir())?;
    Ok(())
}
pub fn private_directory(path: &Path) -> Result<()> {
    fs::create_dir_all(path)?;
    protect(path)
}
pub fn bounded_read(path: &Path, limit: usize) -> Result<Vec<u8>> {
    use std::io::Read;
    let mut file = fs::File::open(path)?;
    if !file.metadata()?.is_file() {
        return fail("INVALID_FILE");
    }
    let mut data = Vec::new();
    file.by_ref()
        .take((limit + 1) as u64)
        .read_to_end(&mut data)?;
    if data.len() > limit {
        return fail("FILE_LIMIT");
    }
    Ok(data)
}
pub fn atomic_write(path: &Path, data: &[u8]) -> Result<()> {
    use std::io::Write;
    private_directory(path.parent().ok_or("INVALID_FILE")?)?;
    let temporary = path.with_extension(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&temporary)?;
        protect(&temporary)?;
        file.write_all(data)?;
        file.sync_all()?;
        drop(file);
        fs::rename(&temporary, path)?;
        Ok(())
    })();
    let _ = fs::remove_file(temporary);
    result
}
pub struct Preferences {
    path: PathBuf,
    state: Mutex<(String, Value)>,
}
impl Preferences {
    pub fn open(directory: &Path) -> Self {
        let path = directory.join("preferences.json");
        let state = if !path.exists() {
            ("missing".into(), Value::Null)
        } else {
            match bounded_read(&path, 4096)
                .and_then(|data| Ok(serde_json::from_slice::<Value>(&data)?))
            {
                Ok(value) if value.is_object() => ("read".into(), value),
                _ => ("unreadable".into(), Value::Null),
            }
        };
        Self {
            path,
            state: Mutex::new(state),
        }
    }
    pub fn snapshot(&self) -> Value {
        let state = self.state.lock().unwrap();
        json!({"status": state.0, "raw": state.1})
    }
    pub fn save(&self, input: Value) -> bool {
        let Some(input) = input.as_object() else {
            return false;
        };
        let mut state = self.state.lock().unwrap();
        let mut next = state.1.as_object().cloned().unwrap_or_default();
        next.extend(input.clone());
        let Ok(data) = serde_json::to_vec(&next) else {
            return false;
        };
        if data.len() > 4096 || atomic_write(&self.path, &data).is_err() {
            return false;
        }
        *state = ("read".into(), Value::Object(next));
        true
    }
}

#[cfg(feature = "native-smoke")]
pub fn validate_smoke() -> Result<PathBuf> {
    let directory = PathBuf::from(
        std::env::var_os("RAYPX_NATIVE_SMOKE_DATA_DIR").ok_or("INVALID_SMOKE_PROFILE")?,
    );
    let config = PathBuf::from(std::env::var_os("RAYPX_HOME").ok_or("INVALID_SMOKE_PROFILE")?);
    if !directory.is_absolute() || config != directory.join("config") {
        return fail("INVALID_SMOKE_PROFILE");
    }
    for (path, directory) in [
        (&directory, true),
        (&config, true),
        (&directory.join(".native-smoke-session-owner"), false),
    ] {
        let metadata = fs::symlink_metadata(path)?;
        if metadata.file_type().is_symlink() || metadata.is_dir() != directory {
            return fail("INVALID_SMOKE_PROFILE");
        }
    }
    if bounded_read(&directory.join(".native-smoke-session-owner"), 64)?
        != b"raypx-native-smoke-v1\n"
    {
        return fail("INVALID_SMOKE_PROFILE");
    }
    Ok(directory)
}
