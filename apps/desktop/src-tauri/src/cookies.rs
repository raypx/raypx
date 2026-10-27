use aes_gcm::{
    Aes256Gcm, KeyInit, Nonce,
    aead::{Aead, Payload},
};
use base64::{Engine, engine::general_purpose::STANDARD};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    fs,
    path::PathBuf,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};
use url::Url;

const MAX_COOKIES: usize = 32;
const SESSION_SERVICE: &str = "com.raypx.desktop.session.v2";

fn session_key_name(directory: &std::path::Path) -> String {
    crate::config::digest(&directory.join("session-v2.enc").to_string_lossy())
}

#[cfg(feature = "native-smoke")]
pub(crate) fn remove_smoke_session_key(directory: &std::path::Path) -> Result<(), String> {
    let entry = keyring::Entry::new(SESSION_SERVICE, &session_key_name(directory))
        .map_err(|_| "Unable to clean up native smoke session key")?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(_) => Err("Unable to clean up native smoke session key".into()),
    }
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Cookie {
    pub name: String,
    pub value: String,
    pub domain: String,
    pub path: String,
    pub secure: bool,
    pub http_only: bool,
    pub same_site: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expiration_date: Option<f64>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum CookieMutation {
    Set(Cookie),
    Remove { name: String, path: String },
}

pub fn auth_cookie(name: &str) -> bool {
    let name = name.strip_prefix("__Secure-").unwrap_or(name);
    name.strip_prefix("better-auth.").is_some_and(|suffix| {
        !suffix.is_empty()
            && suffix
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"_.-".contains(&c))
    })
}

pub fn now() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64()
}

/// Parse every header before applying the batch. Unknown cookie names are ignored.
pub fn parse_cookie(origin: &Url, raw: &str, time: f64) -> Result<Option<CookieMutation>, String> {
    if raw.encode_utf16().count() > 16_384 {
        return Err("API cookie exceeds limit".into());
    }
    let mut parts = raw.split(';');
    let pair = parts.next().unwrap_or_default();
    let Some((name, value)) = pair.split_once('=') else {
        return Ok(None);
    };
    let name = name.trim();
    if !auth_cookie(name) {
        return Ok(None);
    }
    let value = value.trim();
    if !value.bytes().all(|c| {
        c == 0x21
            || (0x23..=0x2b).contains(&c)
            || (0x2d..=0x3a).contains(&c)
            || (0x3c..=0x5b).contains(&c)
            || (0x5d..=0x7e).contains(&c)
    }) {
        return Err("Invalid API cookie".into());
    }
    let fields: HashMap<String, String> = parts
        .map(|part| {
            let (name, value) = part.split_once('=').unwrap_or((part, ""));
            (name.trim().to_ascii_lowercase(), value.trim().to_string())
        })
        .collect();
    let hostname = origin.host_str().ok_or("Invalid API origin")?;
    let domain = fields
        .get("domain")
        .map(String::as_str)
        .unwrap_or(hostname)
        .to_ascii_lowercase();
    let host = domain.strip_prefix('.').unwrap_or(&domain);
    if host.is_empty() || (hostname != host && !hostname.ends_with(&format!(".{host}"))) {
        return Err("Invalid API cookie domain".into());
    }
    let path = fields.get("path").cloned().unwrap_or_else(|| "/".into());
    if path
        .chars()
        .any(|c| c.is_whitespace() || ['?', '#', '\\'].contains(&c))
        || (path != "/" && !path.starts_with("/api/") && !path.starts_with("/rpc/"))
    {
        return Err("Invalid API cookie path".into());
    }
    let max_age = fields
        .get("max-age")
        .map(|value| {
            let digits = value.strip_prefix('-').unwrap_or(value);
            if digits.is_empty() || !digits.bytes().all(|c| c.is_ascii_digit()) {
                return Err("Invalid API cookie expiration".to_string());
            }
            let age = value
                .parse::<i64>()
                .map_err(|_| "Invalid API cookie expiration".to_string())?;
            if age.unsigned_abs() > 9_007_199_254_740_991 {
                return Err("Invalid API cookie expiration".into());
            }
            Ok(age as f64)
        })
        .transpose()?;
    // Validate Expires even when Max-Age takes precedence.
    let expires = fields
        .get("expires")
        .map(|value| {
            httpdate::parse_http_date(value)
                .map(|v| match v.duration_since(UNIX_EPOCH) {
                    Ok(d) => d.as_secs_f64(),
                    Err(d) => -d.duration().as_secs_f64(),
                })
                .map_err(|_| "Invalid API cookie expiration".to_string())
        })
        .transpose()?;
    let secure = fields.contains_key("secure");
    let http_only = fields.contains_key("httponly");
    if (origin.scheme() == "https" || name.starts_with("__Secure-")) && (!secure || !http_only) {
        return Err("Insecure API session cookie".into());
    }
    let same_site = fields.get("samesite").map(|v| v.to_ascii_lowercase());
    if same_site
        .as_deref()
        .is_some_and(|v| !["none", "lax", "strict"].contains(&v))
    {
        return Err("Invalid API cookie SameSite".into());
    }
    let expiration_date = max_age.map(|age| time + age).or(expires);
    if expiration_date.is_some_and(|value| value <= time) {
        return Ok(Some(CookieMutation::Remove {
            name: name.into(),
            path,
        }));
    }
    Ok(Some(CookieMutation::Set(Cookie {
        name: name.into(),
        value: value.into(),
        domain: hostname.into(),
        path,
        secure,
        http_only,
        same_site: match same_site.as_deref() {
            Some("lax") => "lax",
            Some("strict") => "strict",
            _ => "no_restriction",
        }
        .into(),
        expiration_date,
    })))
}

#[derive(Debug)]
pub struct KeyStoreUnavailable;

pub trait KeyStore: Send + Sync {
    fn get(&self, name: &str) -> Result<Option<String>, KeyStoreUnavailable>;
    fn set(&self, name: &str, value: &str) -> Result<(), KeyStoreUnavailable>;
}

struct SystemKeyStore;
impl KeyStore for SystemKeyStore {
    fn get(&self, name: &str) -> Result<Option<String>, KeyStoreUnavailable> {
        let entry = keyring::Entry::new(SESSION_SERVICE, name).map_err(|_| KeyStoreUnavailable)?;
        match entry.get_password() {
            Ok(value) => Ok(Some(value)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(_) => Err(KeyStoreUnavailable),
        }
    }
    fn set(&self, name: &str, value: &str) -> Result<(), KeyStoreUnavailable> {
        keyring::Entry::new(SESSION_SERVICE, name)
            .map_err(|_| KeyStoreUnavailable)?
            .set_password(value)
            .map_err(|_| KeyStoreUnavailable)
    }
}

/// A single host-scoped jar. Atomic persistence commits precede in-memory mutation.
pub struct CookieJar {
    origin: Url,
    file: PathBuf,
    key: Option<[u8; 32]>,
    values: Vec<Cookie>,
    poisoned: bool,
    pub recovery: Option<&'static str>,
}

impl CookieJar {
    pub fn open(directory: PathBuf, origin: &str) -> Result<Self, String> {
        Self::open_with_keys(directory, origin, Arc::new(SystemKeyStore))
    }

    pub fn open_with_keys(
        directory: PathBuf,
        origin: &str,
        keys: Arc<dyn KeyStore>,
    ) -> Result<Self, String> {
        let origin = Url::parse(&crate::config::parse_server_origin(origin)?)
            .map_err(|_| "Invalid API origin")?;
        crate::config::private_directory(&directory)
            .map_err(|_| "Unable to open secure session directory")?;
        // Use a distinct format/path/key service. Upgrades deliberately require sign-in.
        let file = directory.join("session-v2.enc");
        let mut result = Self {
            origin,
            file,
            key: None,
            values: Vec::new(),
            poisoned: false,
            recovery: None,
        };
        let marker = directory.join("tauri-session-v2");
        if !marker.exists() {
            let legacy = directory.join("session.enc");
            match fs::remove_file(legacy) {
                Ok(()) => {}
                Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
                Err(_) => {
                    result.recovery = Some("temporary");
                    return Ok(result);
                }
            }
            if let Ok(entries) = fs::read_dir(&directory) {
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    if name
                        .to_str()
                        .is_some_and(|s| s.starts_with("session.enc.corrupt-"))
                        && entry.file_type().is_ok_and(|kind| kind.is_file())
                    {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
            if crate::prefs::atomic_write(&marker, b"2").is_err() {
                result.recovery = Some("temporary");
                return Ok(result);
            }
        }
        clean_quarantine(&directory);
        let name = session_key_name(&directory);
        let encoded = match keys.get(&name) {
            Ok(value) => value,
            Err(_) => {
                result.recovery = Some("temporary");
                return Ok(result);
            }
        };
        let key_was_missing = encoded.is_none();
        let mut reset = false;
        let key = match encoded {
            Some(encoded) => match STANDARD
                .decode(encoded)
                .ok()
                .and_then(|v| <[u8; 32]>::try_from(v).ok())
            {
                Some(key) => key,
                None => {
                    reset = true;
                    random_key()
                }
            },
            None => {
                reset = result.file.exists();
                random_key()
            }
        };
        if !reset && result.file.exists() {
            match result.read_encrypted(&key) {
                Ok(values) => result.values = values,
                Err(_) => reset = true,
            }
        }
        let key = if reset { random_key() } else { key };
        if reset {
            let quarantine =
                directory.join(format!("session-v2.enc.corrupt-{}", uuid::Uuid::new_v4()));
            if result.file.exists() && fs::rename(&result.file, quarantine).is_err() {
                result.recovery = Some("temporary");
                return Ok(result);
            }
            clean_quarantine(&directory);
            result.values.clear();
            result.recovery = Some("reset");
        }
        // Existing keys do not need updating. New keys are read back before use.
        if (key_was_missing || reset)
            && (keys.set(&name, &STANDARD.encode(key)).is_err()
                || keys.get(&name).ok().flatten().as_deref() != Some(STANDARD.encode(key).as_str()))
        {
            result.values.clear();
            result.recovery = Some("temporary");
            return Ok(result);
        }
        result.key = Some(key);
        Ok(result)
    }

    pub fn memory(origin: &str) -> Result<Self, String> {
        Ok(Self {
            origin: Url::parse(&crate::config::parse_server_origin(origin)?)
                .map_err(|_| "Invalid API origin")?,
            file: PathBuf::new(),
            key: None,
            values: Vec::new(),
            poisoned: false,
            recovery: None,
        })
    }

    fn valid(&self, cookie: &Cookie) -> bool {
        auth_cookie(&cookie.name)
            && cookie.value.len() <= 16_384
            && cookie.value.bytes().all(|c| {
                c == 0x21
                    || (0x23..=0x2b).contains(&c)
                    || (0x2d..=0x3a).contains(&c)
                    || (0x3c..=0x5b).contains(&c)
                    || (0x5d..=0x7e).contains(&c)
            })
            && Some(cookie.domain.as_str()) == self.origin.host_str()
            && (cookie.path == "/"
                || cookie.path.starts_with("/api/")
                || cookie.path.starts_with("/rpc/"))
            && !cookie
                .path
                .chars()
                .any(|c| c.is_whitespace() || ['?', '#', '\\'].contains(&c))
            && (!(self.origin.scheme() == "https" || cookie.name.starts_with("__Secure-"))
                || (cookie.secure && cookie.http_only))
            && cookie.expiration_date.is_none_or(f64::is_finite)
            && ["lax", "strict", "no_restriction"].contains(&cookie.same_site.as_str())
    }

    fn read_encrypted(&self, key: &[u8; 32]) -> Result<Vec<Cookie>, ()> {
        let metadata = fs::metadata(&self.file).map_err(|_| ())?;
        if !metadata.is_file() || metadata.len() > 512 * 1024 {
            return Err(());
        }
        let bytes = crate::config::read_bounded(&self.file, 512 * 1024).map_err(|_| ())?;
        if bytes.len() < 30 || bytes[0] != 2 {
            return Err(());
        }
        let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| ())?;
        let mut plain = cipher
            .decrypt(
                Nonce::from_slice(&bytes[1..13]),
                Payload {
                    msg: &bytes[13..],
                    aad: self.origin.origin().ascii_serialization().as_bytes(),
                },
            )
            .map_err(|_| ())?;
        let values = serde_json::from_slice::<Vec<Cookie>>(&plain).map_err(|_| ());
        plain.fill(0);
        let values = values?;
        if values.len() > MAX_COOKIES || !values.iter().all(|v| self.valid(v)) {
            return Err(());
        }
        Ok(values)
    }

    pub fn header(&self, url: &Url) -> Result<Option<String>, String> {
        if self.poisoned {
            return Err("Native session storage unavailable; restart required".into());
        }
        if url.origin() != self.origin.origin() {
            return Err("Invalid API origin".into());
        }
        let values: Vec<String> = self
            .values
            .iter()
            .filter(|cookie| {
                cookie.expiration_date.is_none_or(|v| v > now())
                    && url.path().starts_with(&cookie.path)
                    && (!cookie.secure || url.scheme() == "https")
            })
            .map(|cookie| format!("{}={}", cookie.name, cookie.value))
            .collect();
        Ok((!values.is_empty()).then(|| values.join("; ")))
    }

    pub fn apply(&mut self, changes: Vec<CookieMutation>) -> Result<(), String> {
        if self.poisoned {
            return Err("Native session storage unavailable; restart required".into());
        }
        if changes.is_empty() {
            return Ok(());
        }
        let mut next = self.values.clone();
        for change in changes {
            match change {
                CookieMutation::Set(cookie) => {
                    next.retain(|v| v.name != cookie.name || v.path != cookie.path);
                    next.push(cookie);
                }
                CookieMutation::Remove { name, path } => {
                    next.retain(|v| v.name != name || !path.starts_with(&v.path))
                }
            }
        }
        if next.len() > MAX_COOKIES || !next.iter().all(|v| self.valid(v)) {
            return Err("Invalid API session cookies".into());
        }
        if let Some(key) = &self.key {
            let result = (|| {
                let mut plain = serde_json::to_vec(
                    &next
                        .iter()
                        .filter(|cookie| cookie.expiration_date.is_some_and(|v| v > now()))
                        .collect::<Vec<_>>(),
                )
                .map_err(|_| ())?;
                if plain.len() > 256 * 1024 {
                    plain.fill(0);
                    return Err(());
                }
                let mut nonce = [0u8; 12];
                rand::thread_rng().fill_bytes(&mut nonce);
                let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| ())?;
                let encrypted = cipher.encrypt(
                    Nonce::from_slice(&nonce),
                    Payload {
                        msg: &plain,
                        aad: self.origin.origin().ascii_serialization().as_bytes(),
                    },
                );
                plain.fill(0);
                let mut bytes = vec![2];
                bytes.extend_from_slice(&nonce);
                bytes.extend_from_slice(&encrypted.map_err(|_| ())?);
                crate::prefs::atomic_write(&self.file, &bytes).map_err(|_| ())
            })();
            if result.is_err() {
                self.poisoned = true;
                return Err("Unable to persist API session; restart required".into());
            }
        }
        self.values = next;
        Ok(())
    }
}

fn random_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    key
}

fn clean_quarantine(directory: &std::path::Path) {
    let Ok(entries) = fs::read_dir(directory) else {
        return;
    };
    let mut files = entries
        .flatten()
        .filter_map(|entry| {
            if !entry
                .file_name()
                .to_str()
                .is_some_and(|s| s.starts_with("session-v2.enc.corrupt-"))
            {
                return None;
            }
            let metadata = entry.metadata().ok()?;
            if !metadata.is_file() {
                return None;
            }
            Some((entry.path(), metadata.modified().ok()?))
        })
        .collect::<Vec<_>>();
    files.sort_by_key(|(_, modified)| std::cmp::Reverse(*modified));
    for (index, (file, modified)) in files.into_iter().enumerate() {
        if index >= 3
            || modified
                .elapsed()
                .is_ok_and(|age| age.as_secs() > 7 * 86_400)
        {
            let _ = fs::remove_file(file);
        }
    }
}
