pub fn external_url(value: &str) -> Option<String> {
    if value.encode_utf16().count() > 8192 || value.chars().any(char::is_control) {
        return None;
    }
    let url = url::Url::parse(value).ok()?;
    (["https", "http"].contains(&url.scheme())
        && url.username().is_empty()
        && url.password().is_none())
    .then(|| url.to_string())
}
