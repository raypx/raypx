use crate::{api::Api, engine::Engine};
use serde_json::{Value, json};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicU64, Ordering},
};
use tokio::sync::Mutex as AsyncMutex;

#[derive(Default)]
struct Session {
    account: Option<String>,
    authorization_error: bool,
}
/// Only the native host bootstraps device credentials. The CLI stores and renews them.
pub struct Control {
    engine: Arc<Engine>,
    api: Arc<Api>,
    origin: String,
    session: Mutex<Session>,
    selecting: AsyncMutex<()>,
    generation: AtomicU64,
}
impl Control {
    pub fn new(engine: Arc<Engine>, api: Arc<Api>, origin: String) -> Self {
        Self {
            engine,
            api,
            origin,
            session: Mutex::new(Session::default()),
            selecting: AsyncMutex::new(()),
            generation: AtomicU64::new(0),
        }
    }
    fn account(&self) -> Option<String> {
        self.session.lock().unwrap().account.clone()
    }
    pub async fn session(&self, account: Option<String>) -> Result<bool, String> {
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let _selecting = self.selecting.lock().await;
        if generation != self.generation.load(Ordering::SeqCst) {
            return Ok(false);
        }
        if let Some(account) = &account {
            self.verify_account(account).await?;
        }
        if generation != self.generation.load(Ordering::SeqCst) {
            return Ok(false);
        }
        self.engine
            .request(
                "host.session",
                json!({"accountId":account,"apiUrl":self.origin}),
            )
            .await?;
        let mut session = self.session.lock().unwrap();
        if session.account != account {
            session.authorization_error = false;
        }
        session.account = account;
        Ok(true)
    }
    async fn verify_account(&self, account: &str) -> Result<(), String> {
        let profile = self.api.rpc("account/get", json!({})).await?;
        if profile["id"] != account {
            return Err("AUTH_REQUIRED".into());
        }
        Ok(())
    }
    pub async fn request(&self, method: &str, input: Value) -> Result<Value, String> {
        let _selecting = if method.starts_with("host.terminal.") {
            Some(self.selecting.lock().await)
        } else {
            None
        };
        let mut params = input.as_object().cloned().ok_or("Invalid control input")?;
        params.insert("apiUrl".into(), json!(self.origin));
        let result = self.engine.request(method, Value::Object(params)).await?;
        if method == "host.info" {
            let mut session = self.session.lock().unwrap();
            if result["authorized"] == true || result["connected"] == true {
                session.authorization_error = false;
            }
            if session.authorization_error {
                let mut result = result;
                result["error"] = json!("AUTH_REQUIRED");
                return Ok(result);
            }
        }
        Ok(result)
    }
    pub async fn attach(&self, input: Value) -> Result<Value, String> {
        let account = input["accountId"].as_str().ok_or("AUTH_REQUIRED")?;
        if input["apiUrl"] != self.origin {
            return Err("Unexpected remote API origin".into());
        }
        if self.account().as_deref() != Some(account) {
            self.session(Some(account.to_owned())).await?;
        }
        let generation = self.generation.load(Ordering::SeqCst);
        if self.account().as_deref() != Some(account) {
            return Err("AUTH_REQUIRED".into());
        }
        let info = self
            .request("host.info", json!({"accountId":account}))
            .await?;
        let grant = &input["grant"];
        if info["authorized"] == true
            && info["binding"]["deviceId"] == grant["deviceId"]
            && info["binding"]["epoch"] == grant["epoch"]
        {
            return Ok(info);
        }
        self.verify_account(account).await?;
        let authorization = match self
            .api
            .rpc(
                "hosts/authorize",
                json!({"deviceId":grant["deviceId"],"epoch":grant["epoch"]}),
            )
            .await
        {
            Ok(value) => value,
            Err(error) => {
                if error == "MISSING_PROCEDURE" {
                    if generation != self.generation.load(Ordering::SeqCst)
                        || self.account().as_deref() != Some(account)
                    {
                        return Err("AUTH_REQUIRED".into());
                    }
                    return self
                        .request("host.legacy", json!({"accountId":account,"grant":grant}))
                        .await;
                }
                if error == "AUTH_REQUIRED" || error == "UNAUTHORIZED" {
                    self.session.lock().unwrap().authorization_error = true;
                }
                return Err(error);
            }
        };
        self.session.lock().unwrap().authorization_error = false;
        if generation != self.generation.load(Ordering::SeqCst)
            || self.account().as_deref() != Some(account)
        {
            let _ = self
                .api
                .rpc(
                    "hosts/revoke",
                    json!({"credential":authorization["credential"]}),
                )
                .await;
            return Err("AUTH_REQUIRED".into());
        }
        self.request(
            "host.authorize",
            json!({"accountId":account,"authorization":authorization}),
        )
        .await
    }
    pub async fn refresh_grant(&self) -> Result<bool, String> {
        if let Some(account) = self.account() {
            return Ok(self
                .request("host.refresh", json!({"accountId":account}))
                .await?
                == true);
        }
        Ok(false)
    }
    pub async fn detach(&self) -> Result<bool, String> {
        if let Some(account) = self.account() {
            self.request("host.detach", json!({"accountId":account}))
                .await?;
        }
        Ok(true)
    }
}
