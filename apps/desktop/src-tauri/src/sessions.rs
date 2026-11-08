#[cfg(not(feature = "native-smoke"))]
use crate::config::digest;
use crate::{
    Result,
    config::{private_directory, protect},
    fail,
};
use aes_gcm::{
    AeadCore, Aes256Gcm, KeyInit, Nonce,
    aead::{Aead, OsRng, Payload},
};
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use std::{
    path::Path,
    time::{SystemTime, UNIX_EPOCH},
};
use url::Url;
use zeroize::Zeroize;

pub struct Instance {
    _connection: Connection,
}
impl Instance {
    pub fn acquire(directory: &Path) -> Result<Self> {
        private_directory(directory)?;
        let file = directory.join("desktop-instance.sqlite");
        if file.exists() {
            protect(&file)?;
        }
        let connection = Connection::open(&file)?;
        protect(&file)?;
        connection.execute_batch("PRAGMA busy_timeout=250; PRAGMA journal_mode=DELETE; BEGIN EXCLUSIVE; PRAGMA locking_mode=EXCLUSIVE; CREATE TABLE IF NOT EXISTS instance (id INTEGER PRIMARY KEY);").map_err(|_| "DESKTOP_ALREADY_RUNNING")?;
        Ok(Self {
            _connection: connection,
        })
    }
}
pub struct Sessions {
    connection: Connection,
    cipher: Option<Aes256Gcm>,
    scope: String,
}
impl Sessions {
    pub fn open(directory: &Path, scope: &str) -> Result<Self> {
        Self::with_key(directory, scope, |create| system_key(directory, create))
    }
    pub fn with_key(
        directory: &Path,
        scope: &str,
        key: impl FnOnce(bool) -> Result<Vec<u8>>,
    ) -> Result<Self> {
        private_directory(directory)?;
        let file = directory.join("tauri-sessions.sqlite");
        for suffix in ["", "-wal", "-shm", "-journal"] {
            let file = directory.join(format!("tauri-sessions.sqlite{suffix}"));
            if file.exists() {
                protect(&file)?;
            }
        }
        let connection = Connection::open(&file)?;
        protect(&file)?;
        connection.execute_batch("PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL;")?;
        let version: i64 = connection.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        let objects: i64 = connection.query_row(
            "SELECT count(*) FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*'",
            [],
            |r| r.get(0),
        )?;
        if version == 0 && objects == 0 {
            connection.execute_batch("BEGIN IMMEDIATE; CREATE TABLE sessions (scope TEXT PRIMARY KEY, cookies BLOB NOT NULL CHECK(typeof(cookies)='blob' AND length(cookies) BETWEEN 29 AND 262172)); PRAGMA user_version=1; COMMIT;")?;
        } else if version != 1 || objects != 1 {
            return fail("UNSUPPORTED_SESSION_SCHEMA");
        }
        let has_rows: bool =
            connection.query_row("SELECT EXISTS(SELECT 1 FROM sessions)", [], |r| r.get(0))?;
        let cipher = key(!has_rows).ok().and_then(|mut key| {
            let cipher = Aes256Gcm::new_from_slice(&key).ok();
            key.zeroize();
            cipher
        });
        Ok(Self {
            connection,
            cipher,
            scope: scope.into(),
        })
    }
    fn load(&self) -> Result<Option<Vec<u8>>> {
        let cipher = self.cipher.as_ref().ok_or("SESSION_KEY_UNAVAILABLE")?;
        let data: Option<Vec<u8>> = self
            .connection
            .query_row(
                "SELECT cookies FROM sessions WHERE scope=?",
                [&self.scope],
                |r| r.get(0),
            )
            .optional()?;
        let Some(data) = data else {
            return Ok(None);
        };
        if data.len() < 29 || data.len() > 262172 {
            return fail("INVALID_SESSION");
        }
        Ok(Some(
            cipher
                .decrypt(
                    Nonce::from_slice(&data[..12]),
                    Payload {
                        msg: &data[12..],
                        aad: self.scope.as_bytes(),
                    },
                )
                .map_err(|_| "SESSION_UNREADABLE")?,
        ))
    }
    fn save(&self, value: &[u8]) -> Result<()> {
        if value.is_empty() {
            self.connection
                .execute("DELETE FROM sessions WHERE scope=?", [&self.scope])?;
            return Ok(());
        }
        if value.len() > 262144 {
            return fail("INVALID_SESSION");
        }
        let cipher = self.cipher.as_ref().ok_or("SESSION_KEY_UNAVAILABLE")?;
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let encrypted = cipher
            .encrypt(
                &nonce,
                Payload {
                    msg: value,
                    aad: self.scope.as_bytes(),
                },
            )
            .map_err(|_| "SESSION_UNAVAILABLE")?;
        let data = [nonce.to_vec(), encrypted].concat();
        self.connection.execute("INSERT INTO sessions(scope,cookies) VALUES(?,?) ON CONFLICT(scope) DO UPDATE SET cookies=excluded.cookies", params![self.scope, data])?;
        Ok(())
    }
}
fn system_key(directory: &Path, create: bool) -> Result<Vec<u8>> {
    #[cfg(feature = "native-smoke")]
    {
        use sha2::{Digest, Sha256};
        let path = directory.canonicalize()?;
        let mut key = Sha256::new();
        key.update(b"raypx-native-smoke-session-key-v1\0");
        key.update(path.to_string_lossy().as_bytes());
        let _ = create;
        Ok(key.finalize().to_vec())
    }
    #[cfg(all(not(feature = "native-smoke"), any(target_os = "macos", windows)))]
    {
        use base64::{Engine, engine::general_purpose::STANDARD};
        let name = format!(
            "tauri-session-key-v1-{}",
            digest(&directory.canonicalize()?.to_string_lossy())
        );
        let entry = keyring::Entry::new("com.raypx.desktop.tauri", &name)
            .map_err(|_| "SESSION_KEY_UNAVAILABLE")?;
        match entry.get_password() {
            Ok(value) => STANDARD
                .decode(value)
                .map_err(|_| "SESSION_KEY_UNAVAILABLE".into()),
            Err(keyring::Error::NoEntry) if create => {
                let key = [
                    uuid::Uuid::new_v4().as_bytes().as_slice(),
                    uuid::Uuid::new_v4().as_bytes().as_slice(),
                ]
                .concat();
                entry
                    .set_password(&STANDARD.encode(&key))
                    .map_err(|_| "SESSION_KEY_UNAVAILABLE")?;
                Ok(key)
            }
            _ => fail("SESSION_KEY_UNAVAILABLE"),
        }
    }
    #[cfg(all(not(feature = "native-smoke"), not(any(target_os = "macos", windows))))]
    {
        let _ = (directory, create, digest(""));
        fail("SESSION_KEY_UNAVAILABLE")
    }
}
fn now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}
#[derive(Clone, Serialize, Deserialize)]
struct StoredCookie {
    name: String,
    value: String,
    path: String,
    secure: bool,
    http_only: bool,
    expires: Option<i64>,
}
fn auth_name(name: &str) -> bool {
    let name = name.strip_prefix("__Secure-").unwrap_or(name);
    name.strip_prefix("better-auth.").is_some_and(|s| {
        !s.is_empty()
            && s.bytes()
                .all(|c| c.is_ascii_alphanumeric() || b"_.-".contains(&c))
    })
}
fn valid_cookie(origin: &Url, c: &StoredCookie) -> bool {
    auth_name(&c.name)
        && c.value.len() <= 16384
        && c.value
            .bytes()
            .all(|b| (0x21..=0x7e).contains(&b) && !b"\";,\\".contains(&b))
        && (c.path == "/" || c.path.starts_with("/api/") || c.path.starts_with("/rpc/"))
        && !c.path.chars().any(|c| c <= ' ' || "?#\\".contains(c))
        && (!(origin.scheme() == "https" || c.name.starts_with("__Secure-"))
            || c.secure && c.http_only)
}
pub struct CookieJar {
    origin: Url,
    values: Vec<StoredCookie>,
    store: Option<Sessions>,
    poisoned: bool,
}
impl CookieJar {
    pub fn open(origin: &str, store: Sessions) -> Result<Self> {
        let mut jar = Self {
            origin: Url::parse(origin)?,
            values: vec![],
            store: None,
            poisoned: false,
        };
        // Unreadable durable storage remains intact; sign-in is temporary this run.
        match store.load() {
            Err(_) => return Ok(jar),
            Ok(Some(data)) => match serde_json::from_slice::<Vec<StoredCookie>>(&data) {
                Ok(values)
                    if values.len() <= 32
                        && values.iter().all(|c| valid_cookie(&jar.origin, c)) =>
                {
                    jar.values = values
                }
                _ => {
                    if store.save(&[]).is_err() {
                        return Ok(jar);
                    }
                }
            },
            Ok(None) => {}
        }
        jar.store = Some(store);
        Ok(jar)
    }
    pub fn header(&self, url: &Url) -> Result<String> {
        if self.poisoned {
            return fail("SESSION_STORAGE_UNAVAILABLE");
        }
        if url.origin() != self.origin.origin() {
            return fail("INVALID_API_ORIGIN");
        }
        Ok(self
            .values
            .iter()
            .filter(|c| {
                c.expires.is_none_or(|t| t > now())
                    && (url.path() == c.path
                        || (url.path().starts_with(&c.path)
                            && (c.path.ends_with('/')
                                || url.path().as_bytes().get(c.path.len()) == Some(&b'/'))))
                    && (!c.secure || url.scheme() == "https")
            })
            .map(|c| format!("{}={}", c.name, c.value))
            .collect::<Vec<_>>()
            .join("; "))
    }
    pub fn apply(&mut self, headers: &[String]) -> Result<()> {
        if self.poisoned {
            return fail("SESSION_STORAGE_UNAVAILABLE");
        }
        if headers.len() > 32 {
            return fail("INVALID_SESSION_COOKIE");
        }
        let mut next = self.values.clone();
        let mut changed = false;
        for raw in headers {
            if raw.encode_utf16().count() > 16384 {
                return fail("INVALID_SESSION_COOKIE");
            }
            let name = raw.split('=').next().unwrap_or("").trim();
            if !auth_name(name) {
                continue;
            }
            let parsed =
                cookie::Cookie::parse(raw.clone()).map_err(|_| "INVALID_SESSION_COOKIE")?;
            let mut expires = parsed.expires_datetime().map(|t| t.unix_timestamp());
            let fields: std::collections::HashMap<_, _> = raw
                .split(';')
                .skip(1)
                .map(|part| {
                    let (k, v) = part.trim().split_once('=').unwrap_or((part.trim(), ""));
                    (k.to_lowercase(), v.trim())
                })
                .collect();
            if let Some(domain) = fields.get("domain") {
                let domain = domain.trim_start_matches('.').to_lowercase();
                let host = self.origin.host_str().unwrap_or("");
                if domain.is_empty() || !(host == domain || host.ends_with(&format!(".{domain}"))) {
                    return fail("INVALID_SESSION_COOKIE");
                }
            }
            if let Some(age) = fields.get("max-age") {
                if age.is_empty()
                    || !age
                        .strip_prefix('-')
                        .unwrap_or(age)
                        .bytes()
                        .all(|c| c.is_ascii_digit())
                {
                    return fail("INVALID_SESSION_COOKIE");
                }
                let age: i64 = age.parse().map_err(|_| "INVALID_SESSION_COOKIE")?;
                if age.abs_diff(0) > 9_007_199_254_740_991 {
                    return fail("INVALID_SESSION_COOKIE");
                }
                expires = now().checked_add(age);
            }
            if fields.contains_key("expires") && parsed.expires_datetime().is_none() {
                return fail("INVALID_SESSION_COOKIE");
            }
            if fields.get("samesite").is_some_and(|value| {
                !["none", "lax", "strict"].contains(&value.to_lowercase().as_str())
            }) {
                return fail("INVALID_SESSION_COOKIE");
            }
            let value = StoredCookie {
                name: name.into(),
                value: parsed.value().into(),
                path: fields
                    .get("path")
                    .filter(|s| !s.is_empty())
                    .copied()
                    .unwrap_or("/")
                    .into(),
                secure: parsed.secure().unwrap_or(false),
                http_only: parsed.http_only().unwrap_or(false),
                expires,
            };
            if !valid_cookie(&self.origin, &value)
                || raw.split(';').next().unwrap_or("").contains('"')
            {
                return fail("INVALID_SESSION_COOKIE");
            }
            let remove = expires.is_some_and(|t| t <= now());
            next.retain(|c| {
                !(c.name == value.name
                    && (c.path == value.path || remove && value.path.starts_with(&c.path)))
            });
            if !remove {
                next.push(value);
            }
            changed = true;
        }
        if !changed {
            return Ok(());
        }
        if next.len() > 32 {
            return fail("INVALID_SESSION_COOKIE");
        }
        if let Some(store) = &self.store {
            let durable: Vec<_> = next
                .iter()
                .filter(|c| c.expires.is_some_and(|t| t > now()))
                .cloned()
                .collect();
            let data = if durable.is_empty() {
                vec![]
            } else {
                serde_json::to_vec(&durable)?
            };
            if store.save(&data).is_err() {
                self.poisoned = true;
                return fail("SESSION_STORAGE_UNAVAILABLE");
            }
        }
        self.values = next;
        Ok(())
    }
}
