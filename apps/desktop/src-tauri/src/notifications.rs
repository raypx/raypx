/// Finder and launchd do not reliably provide LANG. Prefer the operating system
/// locale and keep the environment as a fallback only when that API is unavailable.
pub fn system_locale() -> Option<String> {
    sys_locale::get_locale()
        .filter(|locale| !locale.is_empty())
        .or_else(|| std::env::var("LANG").ok())
}

/// Native notifications only need the raw locale preference; full preference
/// validation remains in the renderer. OS locales use BCP 47 or platform tags.
pub fn language(preference: Option<&str>, system_locale: Option<&str>) -> &'static str {
    match preference {
        Some("zh") => "zh",
        None | Some("" | "system")
            if system_locale
                .and_then(|locale| locale.split(['-', '_', '.', '@']).next())
                .is_some_and(|language| language.eq_ignore_ascii_case("zh")) =>
        {
            "zh"
        }
        _ => "en",
    }
}
