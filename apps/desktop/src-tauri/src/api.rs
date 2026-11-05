use crate::{LINE_LIMIT, Result, fail, sessions::CookieJar};
use reqwest::{Client, Method, redirect::Policy};
use serde::Deserialize;
use serde_json::{Value, json};
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};
use tokio::sync::Semaphore;
use tokio_util::sync::CancellationToken;
use url::Url;
const AUTH: &[&str] = &[
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
#[derive(Deserialize)]
struct Input {
    id: Option<String>,
    path: String,
    method: String,
    headers: HashMap<String, String>,
    body: Option<String>,
}
struct Admission<'a> {
    api: &'a Api,
    id: Option<String>,
}
impl Drop for Admission<'_> {
    fn drop(&mut self) {
        if let Some(id) = &self.id {
            self.api.requests.lock().unwrap().remove(id);
        }
    }
}
pub struct Api {
    origin: Url,
    client: Client,
    cookies: Mutex<CookieJar>,
    requests: Mutex<HashMap<String, CancellationToken>>,
    slots: Semaphore,
    lifetime: CancellationToken,
}
impl Api {
    pub fn new(origin: &str, cookies: CookieJar, lifetime: CancellationToken) -> Result<Arc<Self>> {
        Ok(Arc::new(Self {
            origin: Url::parse(origin)?,
            client: Client::builder()
                .timeout(Duration::from_secs(30))
                .redirect(Policy::none())
                .build()?,
            cookies: Mutex::new(cookies),
            requests: Mutex::new(HashMap::new()),
            slots: Semaphore::new(128),
            lifetime,
        }))
    }
    pub fn cancel(&self, id: &str) -> bool {
        if let Some(cancel) = self.requests.lock().unwrap().get(id) {
            cancel.cancel();
        }
        true
    }
    pub async fn request(&self, input: Value, native: bool) -> Result<Value> {
        if ["id", "body"]
            .iter()
            .any(|key| input.get(key).is_some_and(Value::is_null))
        {
            return fail("INVALID_API_REQUEST");
        }
        let input: Input = serde_json::from_value(input)?;
        let url = self.validate(&input, native)?;
        let _permit = self.slots.try_acquire().map_err(|_| "API_BUSY")?;
        let cancel = self.lifetime.child_token();
        {
            let mut requests = self.requests.lock().unwrap();
            if let Some(id) = &input.id {
                if requests.contains_key(id) {
                    return fail("API_DUPLICATE_REQUEST");
                }
                requests.insert(id.clone(), cancel.clone());
            }
        }
        let _admission = Admission {
            api: self,
            id: input.id.clone(),
        };
        tokio::select! {
            _ = cancel.cancelled() => fail("API_CANCELLED"),
            result = tokio::time::timeout(Duration::from_secs(30), self.fetch(input,url)) => result.map_err(|_| "API_TIMEOUT")?,
        }
    }
    fn validate(&self, input: &Input, native: bool) -> Result<Url> {
        if input.path.encode_utf16().count() > 16384
            || !input.path.starts_with('/')
            || input.path.starts_with("//")
            || !["GET", "POST"].contains(&input.method.as_str())
            || input.headers.len() > 32
            || input.body.as_ref().is_some_and(|s| s.len() > 262144)
        {
            return fail("INVALID_API_REQUEST");
        }
        let url = self.origin.join(&input.path)?;
        if url.origin() != self.origin.origin()
            || url.fragment().is_some()
            || !url.username().is_empty()
            || url.password().is_some()
        {
            return fail("API_PATH_FORBIDDEN");
        }
        let paths: Value = serde_json::from_str(include_str!("../../generated/rpc-paths.json"))?;
        let allowed = |name: &str| {
            paths[name]
                .as_array()
                .is_some_and(|items| items.iter().any(|item| item.as_str() == Some(url.path())))
        };
        let rpc = allowed("renderer") || native && allowed("native");
        if !AUTH.contains(&url.path()) && !rpc {
            return fail("API_PATH_FORBIDDEN");
        }
        if rpc && input.method != "POST" {
            return fail("INVALID_API_REQUEST");
        }
        for (name, value) in &input.headers {
            if !["accept", "accept-language", "content-type"]
                .contains(&name.to_lowercase().as_str())
                || value.encode_utf16().count() > 1024
                || value.contains(['\r', '\n'])
            {
                return fail("INVALID_API_HEADER");
            }
        }
        if input.id.as_ref().is_some_and(|id| {
            id.len() != 36 || id.bytes().any(|c| !b"0123456789abcdef-".contains(&c))
        }) {
            return fail("INVALID_API_REQUEST");
        }
        Ok(url)
    }
    async fn fetch(&self, input: Input, url: Url) -> Result<Value> {
        let cookie = self.cookies.lock().unwrap().header(&url)?;
        let mut request = self
            .client
            .request(
                if input.method == "POST" {
                    Method::POST
                } else {
                    Method::GET
                },
                url,
            )
            .header("Origin", "views://main");
        for (name, value) in &input.headers {
            request = request.header(name, value);
        }
        if !cookie.is_empty() {
            request = request.header("Cookie", cookie);
        }
        if let Some(body) = input.body {
            request = request.body(body);
        }
        let mut response = request.send().await?;
        let changes: Vec<String> = response
            .headers()
            .get_all("set-cookie")
            .iter()
            .map(|h| {
                h.to_str()
                    .map(str::to_owned)
                    .map_err(|_| "INVALID_SESSION_COOKIE")
            })
            .collect::<std::result::Result<_, _>>()?;
        self.cookies.lock().unwrap().apply(&changes)?;
        if response
            .content_length()
            .is_some_and(|n| n > LINE_LIMIT as u64)
        {
            return fail("API_RESPONSE_LIMIT");
        }
        let status = response.status().as_u16();
        let mut headers = json!({});
        for name in ["content-type", "retry-after", "x-request-id"] {
            if let Some(value) = response.headers().get(name).and_then(|v| v.to_str().ok()) {
                headers[name] = json!(value);
            }
        }
        let mut data = Vec::new();
        while let Some(chunk) = response.chunk().await? {
            if data.len() + chunk.len() > LINE_LIMIT {
                return fail("API_RESPONSE_LIMIT");
            }
            data.extend_from_slice(&chunk);
        }
        Ok(json!({"status":status,"headers":headers,"body":String::from_utf8_lossy(&data)}))
    }
    pub async fn rpc(&self, procedure: &str, input: Value) -> Result<Value> {
        let response = self.request(json!({"path":format!("/rpc/{}",procedure.replace('.',"/")),"method":"POST","headers":{"content-type":"application/json"},"body":serde_json::to_string(&json!({"json":input}))?}),true).await?;
        let status = response["status"].as_u64().ok_or("INVALID_API_RESPONSE")?;
        if status == 401 {
            return fail("AUTH_REQUIRED");
        }
        let body =
            serde_json::from_str::<Value>(response["body"].as_str().ok_or("INVALID_API_RESPONSE")?);
        if status == 404
            && body
                .as_ref()
                .ok()
                .is_none_or(|v| !v["json"]["defined"].is_boolean())
        {
            return fail("MISSING_PROCEDURE");
        }
        if (300..400).contains(&status) {
            return fail("INVALID_API_RESPONSE");
        }
        let body = body?;
        for name in ["meta", "maps", "blobs"] {
            if let Some(v) = body.get(name)
                && !v.as_array().is_some_and(|v| v.is_empty())
            {
                return fail("INVALID_API_SERIALIZATION");
            }
        }
        if status >= 400 {
            return match body["json"]["code"].as_str() {
                Some("NOT_FOUND") => fail("NOT_FOUND"),
                Some("FORBIDDEN") => fail("FORBIDDEN"),
                Some("BAD_REQUEST") => fail("BAD_REQUEST"),
                _ => fail("API_REQUEST_FAILED"),
            };
        }
        body.get("json")
            .cloned()
            .ok_or_else(|| "INVALID_API_RESPONSE".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sessions::Sessions;

    #[tokio::test]
    async fn api_policy_matches_the_existing_shared_fixtures() {
        let directory = tempfile::tempdir().unwrap();
        let cookies = CookieJar::open(
            "https://api.example.test",
            Sessions::with_key(directory.path(), "scope", |_| Ok(vec![9; 32])).unwrap(),
        )
        .unwrap();
        let api = Api::new(
            "https://api.example.test",
            cookies,
            CancellationToken::new(),
        )
        .unwrap();
        let fixtures: Vec<Value> =
            serde_json::from_str(include_str!("../../tests/fixtures/native/api-paths.json"))
                .unwrap();
        for row in fixtures {
            let input = row["input"].clone();
            if ["id", "body"]
                .iter()
                .any(|key| input.get(key).is_some_and(Value::is_null))
            {
                assert!(api.request(input, false).await.is_err());
                continue;
            }
            let request = serde_json::from_value(input).unwrap();
            assert_eq!(
                api.validate(&request, row["native"] == true).is_ok(),
                row["allowed"] == true,
                "{}",
                row
            );
        }
    }
}
