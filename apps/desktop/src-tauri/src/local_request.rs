use serde_json::Value;

pub fn assert_renderer_method(method: &str) -> Result<(), String> {
    if method.is_empty()
        || method.len() > 128
        || !method
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || c == b'.')
    {
        return Err("Invalid local method".into());
    }
    if method.starts_with("host.")
        || method == "observed.remote"
        || method == "approvals.local.watch"
    {
        return Err("Use the native account coordination bridge".into());
    }
    if method.starts_with("agents.")
        && !method.starts_with("agents.local.")
        && !["agents.projects", "agents.capabilities", "agents.configure"].contains(&method)
    {
        return Err("Private agent transport is not available to renderer".into());
    }
    if method == "roots.register" {
        return Err("Use the native directory picker to authorize a directory".into());
    }
    let methods =
        serde_json::from_str::<Vec<String>>(include_str!("../generated/local-methods.json"))
            .map_err(|_| "Local method manifest unavailable")?;
    if !methods.iter().any(|allowed| allowed == method) {
        return Err("Local method is not permitted".into());
    }
    Ok(())
}

pub fn scope_local_account(scope: &str, params: &Value) -> Value {
    let Some(input) = params.as_object() else {
        return params.clone();
    };
    let Some(account) = input.get("accountId").and_then(Value::as_str) else {
        return params.clone();
    };
    // JS uses UTF-16 string length for this bounded identifier.
    if account.is_empty()
        || account.encode_utf16().count() > 200
        || account == "device:local-workspace:v1"
    {
        return params.clone();
    }
    let mut result = input.clone();
    result.insert(
        "accountId".into(),
        Value::String(format!(
            "server:{scope}:{}",
            &crate::config::digest(account)[..32]
        )),
    );
    Value::Object(result)
}

pub fn renderer_params(
    method: &str,
    params: &Value,
    directories: &Value,
    scope: &str,
) -> Result<Value, String> {
    assert_renderer_method(method)?;
    if serde_json::to_vec(params)
        .map_err(|_| "Invalid local request")?
        .len()
        > 8 * 1024 * 1024
    {
        return Err("Local request exceeds limit".into());
    }
    if method.starts_with("connectors.")
        && let Some(input) = params.as_object()
    {
        let mut result = input.clone();
        result.insert("configDirs".into(), directories.clone());
        return Ok(Value::Object(result));
    }
    if method.starts_with("agents.local.") {
        return Ok(scope_local_account(scope, params));
    }
    Ok(params.clone())
}
