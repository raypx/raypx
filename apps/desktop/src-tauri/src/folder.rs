use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::State;

#[derive(Default)]
pub struct PiState {
    authorized_project: std::sync::Mutex<Option<String>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PiRuntimeStatus {
    availability: String,
    provider: Option<String>,
    authorized_project: Option<String>,
    reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ProjectPath {
    path: String,
}

#[tauri::command]
pub fn authorize_project_folder(
    input: ProjectPath,
    state: State<'_, PiState>,
) -> Result<PiRuntimeStatus, String> {
    let path = PathBuf::from(&input.path);
    if !path.is_dir() {
        return Err("Project folder does not exist or is not a directory".into());
    }
    let canonical = path
        .canonicalize()
        .map_err(|e| e.to_string())?
        .to_string_lossy()
        .to_string();
    *state
        .authorized_project
        .lock()
        .map_err(|_| "Pi state unavailable".to_string())? = Some(canonical.clone());
    Ok(PiRuntimeStatus {
        availability: "unavailable".into(),
        provider: None,
        authorized_project: Some(canonical),
        reason: Some("Folder authorized; configure a local Pi provider to run sessions.".into()),
    })
}
