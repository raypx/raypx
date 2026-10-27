use crate::Desktop;
use std::sync::{
    Arc,
    atomic::{AtomicBool, Ordering},
};
use tauri::Manager;
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons};
use tauri_plugin_updater::UpdaterExt;

static CHECKING: AtomicBool = AtomicBool::new(false);
struct Checking;
impl Drop for Checking {
    fn drop(&mut self) {
        CHECKING.store(false, Ordering::SeqCst);
    }
}
pub fn configured() -> bool {
    settings().is_some()
}
fn settings() -> Option<(&'static str, url::Url)> {
    let key = option_env!("RAYPX_UPDATER_PUBLIC_KEY").filter(|key| !key.trim().is_empty())?;
    let endpoint = url::Url::parse(option_env!("RAYPX_UPDATER_ENDPOINT")?).ok()?;
    if endpoint.scheme() != "https"
        || !endpoint.username().is_empty()
        || endpoint.password().is_some()
        || endpoint.fragment().is_some()
    {
        return None;
    }
    Some((key, endpoint))
}
fn message(app: &tauri::AppHandle, text: &str) {
    app.dialog().message(text).title("Raypx").show(|_| {});
}
pub fn check(app: tauri::AppHandle) {
    if CHECKING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let _checking = Checking;
        let Some((key, endpoint)) = settings() else {
            message(&app, "Updates are not configured. / 尚未配置更新。");
            return;
        };
        let updater = match app
            .updater_builder()
            .pubkey(key)
            .endpoints(vec![endpoint])
            .and_then(|builder| builder.build())
        {
            Ok(updater) => updater,
            Err(_) => {
                message(&app, "Unable to configure updates. / 无法配置更新。");
                return;
            }
        };
        let update = match updater.check().await {
            Ok(Some(update)) => update,
            Ok(None) => {
                message(&app, "Raypx is up to date. / Raypx 已是最新版本。");
                return;
            }
            Err(_) => {
                message(
                    &app,
                    "Unable to check for updates. Try again later. / 无法检查更新，请稍后重试。",
                );
                return;
            }
        };
        if update.download_url.scheme() != "https"
            || !update.download_url.username().is_empty()
            || update.download_url.password().is_some()
        {
            message(
                &app,
                "The update download must use HTTPS. / 更新下载必须使用 HTTPS。",
            );
            return;
        }
        let (tx, rx) = tokio::sync::oneshot::channel();
        app.dialog()
            .message(format!(
                "Install Raypx {} and restart? / 安装 Raypx {} 并重新启动？",
                update.version, update.version
            ))
            .title("Raypx")
            .buttons(MessageDialogButtons::OkCancelCustom(
                "Install / 安装".into(),
                "Cancel / 取消".into(),
            ))
            .show(move |confirmed| {
                let _ = tx.send(confirmed);
            });
        if !rx.await.unwrap_or(false) {
            return;
        }
        let bytes = match update.download(|_, _| {}, || {}).await {
            Ok(bytes) => bytes,
            Err(_) => {
                message(
                    &app,
                    "The signed update could not be downloaded or verified. / 无法下载或验证更新签名。",
                );
                return;
            }
        };
        let Some(state) = app.try_state::<Arc<Desktop>>() else {
            return;
        };
        let state = state.inner().clone();
        if state.quitting.swap(true, Ordering::SeqCst) {
            return;
        }
        crate::prepare_exit(&app, &state).await;
        if update.install(bytes).is_err() {
            let (tx, rx) = tokio::sync::oneshot::channel();
            app.dialog().message("Unable to install the update. Raypx will restart. / 更新安装失败，Raypx 将重新启动。").title("Raypx").show(move|_|{let _=tx.send(());});
            let _ = rx.await;
        }
        app.restart();
    });
}
