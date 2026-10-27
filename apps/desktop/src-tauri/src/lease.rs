use crate::engine::Engine;
use serde_json::json;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;
use tauri::WebviewWindow;
use tokio::sync::Mutex;

pub struct Lease {
    engine: Arc<Engine>,
    active: Mutex<bool>,
    stopped: AtomicBool,
}
impl Lease {
    pub fn new(engine: Arc<Engine>) -> Self {
        Self {
            engine,
            active: Mutex::new(false),
            stopped: AtomicBool::new(false),
        }
    }
    pub async fn update(&self, window: &WebviewWindow) {
        // Read native visibility after queued updates settle, so an older hide
        // snapshot cannot overwrite a later show (or vice versa).
        let mut previous = self.active.lock().await;
        let ready = self.engine.status()["status"] == "ready"
            && self.engine.features()["localTerminalApprovals"] == true;
        let active = !self.stopped.load(Ordering::SeqCst)
            && ready
            && window.is_visible().unwrap_or(false)
            && !window.is_minimized().unwrap_or(true);
        if !active && !*previous {
            return;
        }
        *previous = active;
        let _ = tokio::time::timeout(
            Duration::from_secs(2),
            self.engine
                .request("approvals.local.watch", json!({"active":active})),
        )
        .await;
    }
    pub async fn stop(&self) {
        self.stopped.store(true, Ordering::SeqCst);
        let mut active = self.active.lock().await;
        if *active {
            let _ = tokio::time::timeout(
                Duration::from_secs(2),
                self.engine
                    .request("approvals.local.watch", json!({"active":false})),
            )
            .await;
        }
        *active = false;
    }
}
