//! CORS acceptance in an isolated, invisible WebView. Compiled only for native-smoke.
use serde_json::{Value, json};
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
};
use std::time::Duration;
use tauri::{WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::oneshot;
use url::Url;

pub fn fixture_origin(raw: &Value) -> Result<Url, String> {
    let raw = raw
        .as_str()
        .filter(|raw| raw.len() <= 2048)
        .ok_or("Invalid CORS fixture origin")?;
    let origin =
        crate::config::parse_server_origin(raw).map_err(|_| "Invalid CORS fixture origin")?;
    let url = Url::parse(&origin).map_err(|_| "Invalid CORS fixture origin")?;
    if url.scheme() != "http"
        || !matches!(url.host_str(), Some("127.0.0.1" | "localhost" | "[::1]"))
        || !url.username().is_empty()
        || url.password().is_some()
        || url.path() != "/"
        || url.query().is_some()
        || url.fragment().is_some()
        || url.port() == Some(0)
    {
        return Err("CORS fixture must be an HTTP loopback origin".into());
    }
    Ok(url)
}

#[derive(Default)]
struct WindowSlot {
    window: Mutex<Option<WebviewWindow>>,
    closed: AtomicBool,
}
struct Cleanup(Arc<WindowSlot>);
impl Drop for Cleanup {
    fn drop(&mut self) {
        self.0.closed.store(true, Ordering::SeqCst);
        if let Some(window) = self.0.window.lock().unwrap().take() {
            let _ = window.destroy();
        }
    }
}
async fn evaluate(window: &WebviewWindow, script: String) -> Result<Value, String> {
    let (tx, rx) = oneshot::channel();
    let tx = Mutex::new(Some(tx));
    window
        .eval_with_callback(script, move |raw| {
            if let Some(tx) = tx.lock().unwrap().take() {
                let _ = tx.send(raw);
            }
        })
        .map_err(|_| "CORS evaluation unavailable")?;
    let raw = rx.await.map_err(|_| "CORS evaluation callback closed")?;
    serde_json::from_str(&raw).map_err(|_| "Invalid CORS evaluation result".into())
}

pub async fn probe(app: &tauri::AppHandle, input: Value) -> Result<Value, String> {
    let origin_a = fixture_origin(&input["originA"])?;
    let origin_b = fixture_origin(&input["originB"])?;
    if origin_a.origin() == origin_b.origin() {
        return Err("CORS fixtures require distinct origins".into());
    }
    let slot = Arc::new(WindowSlot::default());
    let _cleanup = Cleanup(slot.clone());
    tokio::time::timeout(Duration::from_secs(10),async{
        let (created_tx,created_rx)=oneshot::channel();
        let (loaded_tx,loaded_rx)=oneshot::channel();let loaded_tx=Mutex::new(Some(loaded_tx));
        let page=origin_a.join("/__raypx_cors/page").map_err(|_|"Invalid CORS page")?;
        let app_for_ui=app.clone();let allowed=origin_a.origin();
        app.run_on_main_thread(move||{
            let result=WebviewWindowBuilder::new(&app_for_ui,format!("native-smoke-cors-{}",uuid::Uuid::new_v4()),WebviewUrl::External(page))
                .visible(false).focused(false).focusable(false).skip_taskbar(true)
                .on_navigation(move|url|url.origin() == allowed)
                .on_page_load(move|_,payload|{if matches!(payload.event(),tauri::webview::PageLoadEvent::Finished) && let Some(tx)=loaded_tx.lock().unwrap().take(){let _=tx.send(());}})
                .build().map_err(|_|"Unable to create CORS WebView".to_owned());
            if let Ok(window)=&result {
                let mut owned=slot.window.lock().unwrap();
                if slot.closed.load(Ordering::SeqCst){let _=window.destroy();} else {*owned=Some(window.clone());}
            }
            let _=created_tx.send(result);
        }).map_err(|_|"Unable to schedule CORS WebView")?;
        let window=created_rx.await.map_err(|_|"CORS WebView creation closed")??;
        loaded_rx.await.map_err(|_|"CORS fixture did not load")?;
        let origin_a=origin_a.origin().ascii_serialization();let origin_b=origin_b.origin().ascii_serialization();
        let a=serde_json::to_string(&origin_a).unwrap();let b=serde_json::to_string(&origin_b).unwrap();
        let script=format!(r#"(()=>{{
            window.__raypxCorsResult=null;
            void(async()=>{{
                const read=async(url)=>{{const response=await fetch(url,{{cache:'no-store',credentials:'omit'}});if(!response.ok)throw new Error('fixture status');return response.text();}};
                const same=await read({a}+'/__raypx_cors/same');
                const allowed=await read({b}+'/__raypx_cors/allowed');
                let blocked=false;try{{await read({b}+'/__raypx_cors/denied');}}catch{{blocked=true;}}
                window.__raypxCorsResult={{sameOrigin:same==='same-origin',allowedCors:allowed==='allowed-cors',blockedCors:blocked,origin:location.origin,cspMeta:!!document.querySelector('meta[http-equiv="Content-Security-Policy"]')}};
            }})().catch(()=>{{window.__raypxCorsResult={{error:'positive control failed'}};}});
            return null;
        }})()"#);
        evaluate(&window,script).await?;
        loop {
            let result=evaluate(&window,"window.__raypxCorsResult??null".into()).await?;
            if result.is_object() {return Ok(json!({"sameOrigin":result["sameOrigin"],"allowedCors":result["allowedCors"],"blockedCors":result["blockedCors"],"origin":result["origin"],"cspMeta":result["cspMeta"],"error":result["error"]}));}
            tokio::time::sleep(Duration::from_millis(25)).await;
        }
    }).await.map_err(|_|"CORS WebView acceptance timed out")?
}
