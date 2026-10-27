use crate::cookies::{CookieJar, now, parse_cookie};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::{BTreeMap, HashMap},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::watch;
use url::Url;

const AUTH_PATHS: &[&str] = &[
    "/api/auth/get-session",
    "/api/auth/sign-in/email",
    "/api/auth/sign-up/email",
    "/api/auth/sign-out",
    "/api/auth/send-verification-email",
    "/api/auth/verify-email",
    "/api/auth/request-password-reset",
    "/api/auth/reset-password",
    "/api/auth/update-user",
    "/api/auth/list-sessions",
    "/api/auth/revoke-session",
    "/api/auth/revoke-other-sessions",
];
const RPC_PATHS: &[&str] = &[
    "/rpc/account/get",
    "/rpc/devices/register",
    "/rpc/devices/refreshGrant",
    "/rpc/devices/list",
    "/rpc/devices/revoke",
    "/rpc/tasks/list",
    "/rpc/tasks/get",
    "/rpc/approvals/list",
    "/rpc/relay/ticket",
    "/rpc/observed/list",
    "/rpc/observed/get",
    "/rpc/jobs/list",
    "/rpc/jobs/create",
    "/rpc/jobs/update",
    "/rpc/jobs/remove",
    "/rpc/jobs/run",
    "/rpc/jobs/history",
    "/rpc/memory/list",
    "/rpc/memory/get",
    "/rpc/memory/create",
    "/rpc/memory/update",
    "/rpc/memory/archive",
    "/rpc/memory/delete",
    "/rpc/memory/history",
    "/rpc/memory/restore",
    "/rpc/memory/resolve",
];
const NATIVE_PATHS: &[&str] = &["/rpc/hosts/authorize", "/rpc/hosts/revoke"];
const REQUEST_HEADERS: &[&str] = &["accept", "accept-language", "content-type"];
const RESPONSE_HEADERS: &[&str] = &["content-type", "retry-after", "x-request-id"];

#[derive(Deserialize)]
pub struct ApiRequest {
    pub id: Option<String>,
    pub path: String,
    pub method: String,
    pub headers: BTreeMap<String, String>,
    pub body: Option<String>,
}

#[derive(Serialize)]
struct ApiResponse {
    status: u16,
    headers: BTreeMap<String, String>,
    body: String,
}

pub fn validate_request(
    origin: &Url,
    input: Value,
    native: bool,
) -> Result<(ApiRequest, Url), String> {
    if input.get("id").is_some_and(|value| !value.is_string())
        || input.get("body").is_some_and(|value| !value.is_string())
    {
        return Err("Invalid API request".into());
    }
    let input: ApiRequest =
        serde_json::from_value(input).map_err(|_| "Invalid API request".to_string())?;
    if input.path.encode_utf16().count() > 16_384
        || !input.path.starts_with('/')
        || input.path.starts_with("//")
        || !["GET", "POST"].contains(&input.method.as_str())
        || input.headers.len() > 32
        || input.headers.iter().any(|(name, value)| {
            !REQUEST_HEADERS.contains(&name.to_ascii_lowercase().as_str())
                || value.encode_utf16().count() > 1024
        })
        || input
            .body
            .as_ref()
            .is_some_and(|body| body.len() > 256 * 1024)
    {
        return Err("Invalid API request".into());
    }
    let url = origin
        .join(&input.path)
        .map_err(|_| "API path is not permitted")?;
    if url.origin() != origin.origin()
        || url.fragment().is_some()
        || (!AUTH_PATHS.contains(&url.path())
            && !RPC_PATHS.contains(&url.path())
            && !(native && NATIVE_PATHS.contains(&url.path())))
    {
        return Err("API path is not permitted".into());
    }
    if (RPC_PATHS.contains(&url.path()) || NATIVE_PATHS.contains(&url.path()))
        && input.method != "POST"
    {
        return Err("Invalid RPC method".into());
    }
    Ok((input, url))
}

#[derive(Default)]
struct Registry {
    active: usize,
    requests: HashMap<String, watch::Sender<bool>>,
}
struct RequestGuard {
    registry: Arc<Mutex<Registry>>,
    id: Option<String>,
}
impl Drop for RequestGuard {
    fn drop(&mut self) {
        if let Ok(mut registry) = self.registry.lock() {
            registry.active = registry.active.saturating_sub(1);
            if let Some(id) = &self.id {
                registry.requests.remove(id);
            }
        }
    }
}

#[derive(Clone)]
pub struct Api {
    origin: Url,
    client: reqwest::Client,
    cookies: Arc<Mutex<CookieJar>>,
    registry: Arc<Mutex<Registry>>,
    pub recovery: Option<&'static str>,
}

impl Api {
    pub async fn new(origin: String, server_directory: PathBuf) -> Result<Self, String> {
        let parsed = crate::config::parse_server_origin(&origin)?;
        let cookies =
            tokio::task::spawn_blocking(move || CookieJar::open(server_directory, &parsed))
                .await
                .map_err(|_| "Unable to open secure session storage")??;
        Self::with_cookies(&origin, cookies)
    }

    pub fn with_cookies(origin: &str, cookies: CookieJar) -> Result<Self, String> {
        let origin = Url::parse(&crate::config::parse_server_origin(origin)?)
            .map_err(|_| "Invalid API origin")?;
        let client = reqwest::Client::builder()
            .use_rustls_tls()
            .redirect(reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|_| "Unable to initialize API transport")?;
        let recovery = cookies.recovery;
        Ok(Self {
            origin,
            client,
            cookies: Arc::new(Mutex::new(cookies)),
            registry: Arc::new(Mutex::new(Registry::default())),
            recovery,
        })
    }

    pub fn cancel(&self, id: &str) -> bool {
        if let Ok(registry) = self.registry.lock()
            && let Some(sender) = registry.requests.get(id)
        {
            sender.send_replace(true);
        }
        true
    }

    pub async fn request(&self, input: Value) -> Result<Value, String> {
        self.request_internal(input, false).await
    }

    pub(crate) async fn request_internal(
        &self,
        input: Value,
        native: bool,
    ) -> Result<Value, String> {
        let (input, url) = validate_request(&self.origin, input, native)?;
        if input.id.as_ref().is_some_and(|id| {
            id.len() != 36
                || !id
                    .bytes()
                    .all(|v| v.is_ascii_digit() || (b'a'..=b'f').contains(&v) || v == b'-')
        }) {
            return Err("Invalid API request identity".into());
        }
        let mut headers = reqwest::header::HeaderMap::new();
        for (name, value) in &input.headers {
            let name =
                reqwest::header::HeaderName::from_bytes(name.to_ascii_lowercase().as_bytes())
                    .map_err(|_| "Invalid API request headers")?;
            headers.insert(
                name,
                reqwest::header::HeaderValue::from_str(value)
                    .map_err(|_| "Invalid API request headers")?,
            );
        }
        headers.insert(
            reqwest::header::ORIGIN,
            reqwest::header::HeaderValue::from_static("views://main"),
        );
        let cookie = self
            .cookies
            .lock()
            .map_err(|_| "Native session storage unavailable; restart required")?
            .header(&url)?;
        if let Some(cookie) = cookie {
            headers.insert(
                reqwest::header::COOKIE,
                reqwest::header::HeaderValue::from_str(&cookie)
                    .map_err(|_| "Invalid API session cookie")?,
            );
        }
        let (sender, mut cancellation) = watch::channel(false);
        let guard = {
            let mut registry = self
                .registry
                .lock()
                .map_err(|_| "API transport unavailable")?;
            if registry.active >= 128 {
                return Err("Too many API requests".into());
            }
            if let Some(id) = &input.id {
                if registry.requests.contains_key(id) {
                    return Err("Invalid API request identity".into());
                }
                registry.requests.insert(id.clone(), sender);
            }
            registry.active += 1;
            RequestGuard {
                registry: self.registry.clone(),
                id: input.id.clone(),
            }
        };
        let request = async {
            let method = if input.method == "GET" {
                reqwest::Method::GET
            } else {
                reqwest::Method::POST
            };
            let mut request = self.client.request(method, url).headers(headers);
            if let Some(body) = input.body {
                request = request.body(body);
            }
            let response = request.send().await.map_err(|_| "API request failed")?;
            let status = response.status().as_u16();
            let set_cookies = response.headers().get_all(reqwest::header::SET_COOKIE);
            if set_cookies.iter().count() > 32 {
                return Err("Too many API response cookies".to_string());
            }
            let changes = set_cookies
                .iter()
                .map(|raw| {
                    raw.to_str()
                        .map_err(|_| "Invalid API cookie".to_string())
                        .and_then(|raw| parse_cookie(&self.origin, raw, now()))
                })
                .collect::<Result<Vec<_>, _>>()?
                .into_iter()
                .flatten()
                .collect();
            self.cookies
                .lock()
                .map_err(|_| "Native session storage unavailable; restart required")?
                .apply(changes)?;
            let response_headers = response
                .headers()
                .iter()
                .filter_map(|(name, value)| {
                    RESPONSE_HEADERS
                        .contains(&name.as_str())
                        .then(|| {
                            value
                                .to_str()
                                .ok()
                                .map(|value| (name.as_str().into(), value.into()))
                        })
                        .flatten()
                })
                .collect();
            if response
                .content_length()
                .is_some_and(|size| size > 8 * 1024 * 1024)
            {
                return Err("API response exceeds limit".into());
            }
            let mut stream = response.bytes_stream();
            let mut bytes = Vec::new();
            while let Some(chunk) = stream.next().await {
                let chunk = chunk.map_err(|_| "API response failed")?;
                if bytes.len() + chunk.len() > 8 * 1024 * 1024 {
                    return Err("API response exceeds limit".into());
                }
                bytes.extend_from_slice(&chunk);
            }
            serde_json::to_value(ApiResponse {
                status,
                headers: response_headers,
                body: String::from_utf8_lossy(&bytes).into_owned(),
            })
            .map_err(|_| "Invalid API response".into())
        };
        let result = tokio::select! {
            result = tokio::time::timeout(Duration::from_secs(30), request) => result.map_err(|_| "API request timed out".to_string())?,
            _ = cancellation.changed() => Err("API request cancelled".into()),
        };
        drop(guard);
        result
    }

    /// Only Rust callers can access host credential procedures. Envelopes stay JSON.
    pub async fn rpc(&self, procedure: &str, input: Value) -> Result<Value, String> {
        crate::orpc_client::call(self, procedure, input).await
    }
}
