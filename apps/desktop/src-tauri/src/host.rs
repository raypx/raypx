use crate::{
    LINE_LIMIT, Result,
    api::Api,
    config::{Config, Preferences},
    engine::{Engine, command},
    events::Events,
    fail,
    sessions::{CookieJar, Instance, Sessions},
};
use serde_json::{Value, json};
use std::{
    collections::HashSet,
    path::PathBuf,
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
    time::Duration,
};
use tokio::{io::AsyncReadExt, sync::Mutex as AsyncMutex};
use tokio_util::sync::CancellationToken;
pub struct Host {
    pub config: Config,
    pub directory: PathBuf,
    pub engine: Arc<Engine>,
    pub events: Arc<Events>,
    pub preferences: Preferences,
    pub api: Arc<Api>,
    _instance: Mutex<Instance>,
    methods: HashSet<String>,
    account: AsyncMutex<Option<String>>,
    generation: AtomicU64,
    authorization_error: AtomicBool,
    visible: AtomicBool,
    closed: AtomicBool,
    pub tray: AtomicBool,
    lifetime: CancellationToken,
    lease: AsyncMutex<()>,
    active: AtomicBool,
}
impl Host {
    pub fn open(config: Config, directory: PathBuf, binary: PathBuf) -> Result<Arc<Self>> {
        if !binary.is_absolute() {
            return fail("CLI_PATH_INVALID");
        }
        let instance = Instance::acquire(&directory)?;
        let resource: Value = serde_json::from_slice(&crate::config::bounded_read(
            &binary
                .parent()
                .ok_or("CLI_PATH_INVALID")?
                .join("runtime.json"),
            1024 * 1024,
        )?)?;
        if resource["format"] != 1 || resource["version"] != env!("CARGO_PKG_VERSION") {
            return fail("CLI_VERSION_MISMATCH");
        }
        let built_at = resource["builtAt"].as_u64().ok_or("CLI_VERSION_MISMATCH")?;
        let lifetime = CancellationToken::new();
        let api = Api::new(
            &config.api,
            CookieJar::open(&config.api, Sessions::open(&directory, &config.scope)?)?,
            lifetime.clone(),
        )?;
        let events = Arc::new(Events::default());
        #[cfg(not(feature = "native-smoke"))]
        let args = vec!["--profile".into(), config.profile.clone()];
        #[cfg(feature = "native-smoke")]
        let args = vec![
            "--profile".into(),
            "native-smoke".into(),
            "--data-dir".into(),
            directory.to_string_lossy().into_owned(),
        ];
        let engine = Engine::new(
            binary,
            args,
            env!("CARGO_PKG_VERSION").into(),
            built_at,
            cfg!(any(target_os = "macos", windows)),
            events.clone(),
        );
        Ok(Arc::new(Self {
            preferences: Preferences::open(&directory),
            config,
            directory,
            engine,
            events,
            api,
            _instance: Mutex::new(instance),
            methods: serde_json::from_str(include_str!("../../generated/local-methods.json"))?,
            account: AsyncMutex::new(None),
            generation: AtomicU64::new(0),
            authorization_error: AtomicBool::new(false),
            visible: AtomicBool::new(true),
            closed: AtomicBool::new(false),
            tray: AtomicBool::new(false),
            lifetime,
            lease: AsyncMutex::new(()),
            active: AtomicBool::new(false),
        }))
    }
    pub fn runtime(&self) -> Value {
        json!({"appVersion":env!("CARGO_PKG_VERSION"),"platform":if cfg!(target_os="macos") {"darwin"} else if cfg!(windows) {"win32"} else {"linux"},"trayEnabled":self.tray.load(Ordering::SeqCst),"engine":self.engine.status(),"features":self.engine.features(),"compiledFeatures":if cfg!(feature="native-smoke") {vec!["native-smoke"]} else {vec![]}})
    }
    pub fn preload(&self) -> String {
        let connection = json!({"apiUrl":self.config.api,"webUrl":self.config.web});
        let preferences = self.preferences.snapshot();
        let connection = serde_json::to_string(&connection.to_string()).unwrap();
        let preferences = serde_json::to_string(&preferences.to_string()).unwrap();
        format!(
            "(()=>{{function freeze(v){{if(v&&typeof v==='object'){{Object.values(v).forEach(freeze);Object.freeze(v)}}}}const c=JSON.parse({connection}),p=JSON.parse({preferences});freeze(c);freeze(p);Object.defineProperties(window,{{__raypxConnection:{{value:c}},__raypxDevicePreferences:{{value:p}},__raypxTerminalHooks:{{value:{}}},__raypxDesktopHost:{{value:'tauri'}}}})}})();",
            cfg!(any(target_os = "macos", windows))
        )
    }
    pub fn renderer_params(&self, method: &str, mut params: Value) -> Result<Value> {
        if method.is_empty()
            || method.len() > 128
            || !method
                .bytes()
                .all(|c| c.is_ascii_alphanumeric() || c == b'.')
            || !self.methods.contains(method)
            || method.starts_with("host.")
            || ["observed.remote", "approvals.local.watch", "roots.register"].contains(&method)
            || (method.starts_with("agents.")
                && !method.starts_with("agents.local.")
                && ![
                    "agents.projects",
                    "agents.capabilities",
                    "agents.configure",
                    "agents.models.list",
                    "agents.models.default",
                    "agents.models.setDefault",
                ]
                .contains(&method))
        {
            return fail("LOCAL_METHOD_FORBIDDEN");
        }
        if serde_json::to_vec(&params)?.len() > LINE_LIMIT {
            return fail("REQUEST_LIMIT");
        }
        if params.is_object() {
            if method == "instance.begin" {
                params["origin"] = json!(self.config.api);
            }
            if method.starts_with("agents.local.")
                && params
                    .get("accountId")
                    .is_some_and(|id| id != "device:local-workspace:v1")
            {
                return fail("INVALID_LOCAL_OWNER");
            }
            if method.starts_with("connectors.") {
                params["configDirs"] = self.config.directories.clone();
            }
        }
        Ok(params)
    }
    pub async fn request(self: &Arc<Self>, method: &str, input: Value) -> Result<Value> {
        if self.closed.load(Ordering::SeqCst) {
            return fail("CLOSING");
        }
        match method {
            "get_runtime" => Ok(self.runtime()),
            "api_fetch" => self.api.request(input, false).await,
            "api_cancel" => Ok(json!(self.api.cancel(input["id"].as_str().unwrap_or("")))),
            "get_analytics_preferences" => {
                Ok(self.preferences.snapshot()["raw"]["analytics"].clone())
            }
            "save_analytics_preferences" => {
                Ok(json!(self.preferences.save(json!({"analytics":input}))))
            }
            "save_preferences" => Ok(json!(self.preferences.save(input))),
            "restart_engine" => {
                let result = self.engine.start(input["replaceOwner"] == true).await?;
                self.update_lease().await;
                Ok(json!(result))
            }
            "local_request" => {
                let method = input["method"].as_str().ok_or("INVALID_REQUEST")?;
                let params = self.renderer_params(method, input["params"].clone())?;
                if method == "connectors.install" && params["recoverModified"] == true {
                    return self.repair(params).await;
                }
                self.engine.request(method, params).await
            }
            "control_session" => {
                self.session(input["accountId"].as_str().map(str::to_owned))
                    .await?;
                Ok(json!(true))
            }
            "control_attach" => self.attach(input).await,
            "control_detach" => {
                let account = self.account.lock().await.clone();
                if let Some(id) = account {
                    self.control("host.detach", json!({"accountId":id})).await?;
                }
                Ok(json!(true))
            }
            "control_info" | "control_enable" | "control_revoked" | "terminal_settings"
            | "terminal_configure" => {
                let mapped = match method {
                    "control_info" => "host.info",
                    "control_enable" => "host.enable",
                    "control_revoked" => "host.revoked",
                    "terminal_settings" => "host.terminal.settings",
                    _ => "host.terminal.configure",
                };
                self.control(mapped, input).await
            }
            _ => fail("DESKTOP_METHOD_FORBIDDEN"),
        }
    }
    pub async fn refresh_grant(&self) -> Result<bool> {
        let account = self.account.lock().await.clone();
        let Some(account) = account else {
            return Ok(false);
        };
        Ok(self
            .control("host.refresh", json!({"accountId":account}))
            .await?
            == true)
    }
    async fn verify_account(&self, account: &str) -> Result<()> {
        let profile = self.api.rpc("account/get", json!({})).await?;
        if profile["id"] != account {
            return fail("AUTH_REQUIRED");
        }
        Ok(())
    }
    async fn session(&self, selected: Option<String>) -> Result<()> {
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let mut account = self.account.lock().await;
        if selected.as_ref().is_some_and(|id| id.is_empty()) {
            return fail("AUTH_REQUIRED");
        }
        if let Some(id) = &selected {
            self.verify_account(id).await?;
        }
        if generation != self.generation.load(Ordering::SeqCst) {
            return fail("AUTH_REQUIRED");
        }
        self.engine
            .request(
                "host.session",
                json!({"accountId":selected,"apiUrl":self.config.api}),
            )
            .await?;
        if *account != selected {
            self.authorization_error.store(false, Ordering::SeqCst);
        }
        *account = selected;
        Ok(())
    }
    async fn control(&self, method: &str, mut input: Value) -> Result<Value> {
        if !input.is_object() {
            return fail("INVALID_REQUEST");
        }
        let _guard = if method.starts_with("host.terminal.") {
            Some(self.account.lock().await)
        } else {
            None
        };
        input["apiUrl"] = json!(self.config.api);
        let mut value = self.engine.request(method, input).await?;
        if method == "host.info" {
            if value["authorized"] == true || value["connected"] == true {
                self.authorization_error.store(false, Ordering::SeqCst);
            }
            if self.authorization_error.load(Ordering::SeqCst) {
                value["error"] = json!("AUTH_REQUIRED");
            }
        }
        Ok(value)
    }
    async fn attach(&self, input: Value) -> Result<Value> {
        let id = input["accountId"]
            .as_str()
            .filter(|s| !s.is_empty())
            .ok_or("AUTH_REQUIRED")?;
        if input["apiUrl"] != self.config.api {
            return fail("AUTH_REQUIRED");
        }
        if self.account.lock().await.as_deref() != Some(id) {
            self.session(Some(id.into())).await?;
        }
        let generation = self.generation.load(Ordering::SeqCst);
        if self.account.lock().await.as_deref() != Some(id) {
            return fail("AUTH_REQUIRED");
        }
        let info = self.control("host.info", json!({"accountId":id})).await?;
        let grant = &input["grant"];
        if info["authorized"] == true
            && info["binding"]["deviceId"] == grant["deviceId"]
            && info["binding"]["epoch"] == grant["epoch"]
        {
            return Ok(info);
        }
        self.verify_account(id).await?;
        let authorization = self
            .api
            .rpc(
                "hosts/authorize",
                json!({"deviceId":grant["deviceId"],"epoch":grant["epoch"]}),
            )
            .await;
        if authorization
            .as_ref()
            .is_err_and(|error| error.0 == "AUTH_REQUIRED")
        {
            self.authorization_error.store(true, Ordering::SeqCst);
        }
        let authorization = authorization?;
        let account = self.account.lock().await;
        if generation != self.generation.load(Ordering::SeqCst) || account.as_deref() != Some(id) {
            drop(account);
            let _ = self
                .api
                .rpc(
                    "hosts/revoke",
                    json!({"credential":authorization["credential"]}),
                )
                .await;
            return fail("AUTH_REQUIRED");
        }
        // Serialize the credential handoff with logout, which must revoke this binding.
        self.control(
            "host.authorize",
            json!({"accountId":id,"authorization":authorization}),
        )
        .await
    }
    async fn repair(&self, input: Value) -> Result<Value> {
        let provider = input["provider"]
            .as_str()
            .filter(|p| ["claude", "codex"].contains(p))
            .ok_or("INSTALLATION_FAILED")?;
        let mut command = command(&self.engine.binary);
        command
            .args([
                "connectors",
                "repair",
                provider,
                &serde_json::to_string(&json!({"configDirs":self.config.directories}))?,
                "--json",
                "--profile",
                &self.config.profile,
            ])
            .stdin(std::process::Stdio::null())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::null())
            .kill_on_drop(true);
        let mut child = command.spawn()?;
        let mut stdout = child.stdout.take().ok_or("INSTALLATION_FAILED")?;
        let mut data = vec![];
        let result = tokio::time::timeout(Duration::from_secs(30), async {
            (&mut stdout).take(262145).read_to_end(&mut data).await?;
            if data.len() > 262144 {
                return fail("INSTALLATION_FAILED");
            }
            if !child.wait().await?.success() {
                return fail("INSTALLATION_FAILED");
            }
            Ok(serde_json::from_slice(&data)?)
        })
        .await
        .map_err(|_| "INSTALLATION_TIMEOUT")?;
        if result.is_err() {
            let _ = child.kill().await;
        }
        result
    }
    pub async fn visible(&self, value: bool) {
        self.visible.store(value, Ordering::SeqCst);
        self.update_lease().await;
    }
    pub async fn update_lease(&self) {
        let _guard = self.lease.lock().await;
        let active = !self.closed.load(Ordering::SeqCst)
            && self.visible.load(Ordering::SeqCst)
            && self.engine.status()["status"] == "ready"
            && self.engine.features()["localTerminalApprovals"] == true;
        if !self.active.swap(active, Ordering::SeqCst) && !active {
            return;
        }
        let _ = tokio::time::timeout(
            Duration::from_secs(2),
            self.engine
                .request("approvals.local.watch", json!({"active":active})),
        )
        .await;
    }
    pub async fn close(&self) {
        if self.closed.swap(true, Ordering::SeqCst) {
            return;
        }
        self.lifetime.cancel();
        self.update_lease().await;
        self.engine.close().await;
    }
    pub fn cancelled(&self) -> CancellationToken {
        self.lifetime.clone()
    }
}
pub fn trusted_url(url: &url::Url, scope: &str) -> bool {
    if !url.username().is_empty() || url.password().is_some() {
        return false;
    }
    let scheme = format!("raypx-{scope}");
    (url.scheme() == scheme && url.host_str() == Some("localhost") && url.port().is_none())
        || (cfg!(windows)
            && url.scheme() == "http"
            && url.host_str() == Some(format!("{scheme}.localhost").as_str())
            && url.port().is_none())
        || (cfg!(debug_assertions)
            && url.scheme() == "http"
            && url.host_str() == Some("localhost")
            && url.port() == Some(1420))
}

pub fn external_url(raw: &str) -> Result<url::Url> {
    if raw.len() > 8192 || raw.chars().any(|c| c <= ' ' || c == '\u{7f}') {
        return fail("INVALID_EXTERNAL_URL");
    }
    let url = url::Url::parse(raw)?;
    if !["https", "http", "mailto"].contains(&url.scheme())
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return fail("INVALID_EXTERNAL_URL");
    }
    Ok(url)
}
