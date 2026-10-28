use serde::Serialize;
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::BTreeMap,
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
};
use url::Url;

pub const DEFAULT_CONFIG: &str = "# Raypx reads this file on startup. Restart after editing.\n# One installation can connect to any Raypx deployment.\nbase_url = \"https://raypx.pro\"\n# web_url = \"https://raypx.pro\" # Only needed when Web and API use different origins.\n# profile = \"beta\"            # Select a named profile; omit for the defaults above.\n\n[profiles.beta]\nbase_url = \"https://beta.raypx.pro\"\n\n# [profiles.self_hosted]\n# base_url = \"https://raypx.example.com\"\n";

#[derive(Clone, Debug, Serialize)]
pub struct DesktopConfig {
    pub api_url: String,
    pub web_url: String,
    pub scope: String,
    pub connector_directories: Value,
    pub preload: String,
}

pub fn parse_server_origin(raw: &str) -> Result<String, String> {
    let invalid = "Server URL must be an HTTPS origin (HTTP is allowed on loopback only)";
    if raw.encode_utf16().count() > 2048
        || !["https://", "http://"]
            .iter()
            .any(|prefix| raw.to_ascii_lowercase().starts_with(prefix))
        || raw.chars().any(|c| c <= ' ' || c == '\u{7f}' || c == '\\')
    {
        return Err(invalid.into());
    }
    let url = Url::parse(raw).map_err(|_| invalid.to_string())?;
    let loopback = matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"));
    if (url.scheme() != "https" && !(url.scheme() == "http" && loopback))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
        || url.host_str().is_none()
    {
        return Err(
            "Server URL must be an HTTPS origin without credentials, path, query or fragment"
                .into(),
        );
    }
    Ok(url.origin().ascii_serialization())
}

fn profile_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= 64
        && name.as_bytes()[0].is_ascii_alphanumeric()
        && name
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'_' || c == b'-')
}

fn endpoints(table: &toml::Table) -> Result<(Option<String>, Option<String>), String> {
    let parse = |key| {
        table
            .get(key)
            .map(|v| {
                v.as_str()
                    .ok_or_else(|| "Server URL must be an HTTPS origin".to_string())
                    .and_then(parse_server_origin)
            })
            .transpose()
    };
    Ok((parse("base_url")?, parse("web_url")?))
}

pub fn parse(source: &str) -> Result<DesktopConfig, String> {
    if source.len() > 16 * 1024 {
        return Err("Configuration exceeds 16 KiB".into());
    }
    let root: toml::Table =
        toml::from_str(source).map_err(|_| "Invalid TOML syntax".to_string())?;
    if root.keys().any(|key| {
        ![
            "base_url",
            "web_url",
            "profile",
            "profiles",
            "ai",
            "connectors",
        ]
        .contains(&key.as_str())
    }) {
        return Err("Unknown configuration option; use base_url, web_url, profile, profiles, ai or connectors".into());
    }
    if root.get("ai").is_some_and(|v| !v.is_table()) {
        return Err("ai must be a table".into());
    }
    let mut directories = serde_json::Map::new();
    if let Some(value) = root.get("connectors") {
        let table = value
            .as_table()
            .ok_or("connectors supports absolute claude_config_dir and codex_home paths only")?;
        for (key, path) in table {
            let name =
                match key.as_str() {
                    "claude_config_dir" => "claude",
                    "codex_home" => "codex",
                    _ => return Err(
                        "connectors supports absolute claude_config_dir and codex_home paths only"
                            .into(),
                    ),
                };
            let path = path
                .as_str()
                .filter(|p| std::path::Path::new(p).is_absolute())
                .ok_or(
                    "connectors supports absolute claude_config_dir and codex_home paths only",
                )?;
            directories.insert(name.into(), json!(path));
        }
    }
    let defaults = endpoints(&root)?;
    let mut profiles = BTreeMap::new();
    if let Some(value) = root.get("profiles") {
        let table = value.as_table().ok_or("profiles must be a table")?;
        for (name, profile) in table {
            let table = profile
                .as_table()
                .ok_or("Invalid profile; profiles support base_url and web_url only")?;
            if !profile_name(name)
                || table
                    .keys()
                    .any(|k| !["base_url", "web_url"].contains(&k.as_str()))
            {
                return Err("Invalid profile; profiles support base_url and web_url only".into());
            }
            profiles.insert(name.clone(), endpoints(table)?);
        }
    }
    let selected = match root.get("profile") {
        Some(value) => profiles
            .get(
                value
                    .as_str()
                    .filter(|v| profile_name(v))
                    .ok_or("profile must select an existing named profile")?,
            )
            .cloned()
            .ok_or("profile must select an existing named profile")?,
        None => (None, None),
    };
    let api_url = selected
        .0
        .clone()
        .or(defaults.0)
        .unwrap_or_else(|| "https://raypx.pro".into());
    let web_url = selected.1.unwrap_or_else(|| {
        if selected.0.is_some() {
            api_url.clone()
        } else {
            defaults.1.unwrap_or_else(|| api_url.clone())
        }
    });
    let scope = digest(&api_url)[..32].to_string();
    let connection = json!({"apiUrl":api_url,"webUrl":web_url});
    // '<' is escaped so this script is safe even when included in HTML tooling.
    let encoded = connection.to_string().replace('<', "\\u003c");
    let preload = format!(
        "Object.defineProperty(window,\"__raypxConnection\",{{value:Object.freeze({encoded})}});"
    );
    Ok(DesktopConfig {
        api_url,
        web_url,
        scope,
        connector_directories: Value::Object(directories),
        preload,
    })
}

pub fn load(directory: Option<PathBuf>) -> Result<DesktopConfig, String> {
    let directory = directory
        .or_else(|| std::env::var_os("RAYPX_HOME").map(PathBuf::from))
        .or_else(|| {
            std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
                .map(|p| PathBuf::from(p).join(".raypx"))
        })
        .ok_or("Unable to locate the Raypx configuration directory")?;
    if !directory.is_absolute() {
        return Err("RAYPX_HOME must be an absolute directory".into());
    }
    let file = directory.join("config.toml");
    let result = (|| {
        private_directory(&directory).map_err(|_| "Unable to create configuration directory")?;
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        match options.open(&file) {
            Ok(mut output) => output
                .write_all(DEFAULT_CONFIG.as_bytes())
                .map_err(|_| "Unable to create config.toml")?,
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(_) => return Err("Unable to create config.toml".to_string()),
        }
        let metadata = fs::metadata(&file).map_err(|_| "Unable to read config.toml")?;
        if !metadata.is_file() || metadata.len() > 16 * 1024 {
            return Err("config.toml must be a file of at most 16 KiB".into());
        }
        let source = String::from_utf8(
            read_bounded(&file, 16 * 1024).map_err(|_| "Unable to read config.toml")?,
        )
        .map_err(|_| "Unable to read config.toml")?;
        parse(&source)
    })();
    result.map_err(|reason| format!("Raypx configuration error: {}\n{reason}", file.display()))
}

pub fn digest(value: &str) -> String {
    Sha256::digest(value.as_bytes())
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect()
}

pub fn private_directory(path: &std::path::Path) -> std::io::Result<()> {
    let mut builder = fs::DirBuilder::new();
    builder.recursive(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::DirBuilderExt;
        builder.mode(0o700);
    }
    builder.create(path)
}

/// Metadata is only an early check: the file may grow or be replaced before read.
pub(crate) fn read_bounded(path: &Path, limit: usize) -> std::io::Result<Vec<u8>> {
    let mut bytes = Vec::new();
    fs::File::open(path)?
        .take(limit as u64 + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        return Err(std::io::Error::other("File exceeds size limit"));
    }
    Ok(bytes)
}
