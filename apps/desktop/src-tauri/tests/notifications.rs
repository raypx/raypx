use raypx_desktop::notifications::language;

#[test]
fn explicit_preferences_take_priority_over_the_os_locale() {
    for os_locale in [None, Some("zh-Hans-CN"), Some("en_US.UTF-8")] {
        assert_eq!(language(Some("zh"), os_locale), "zh");
        assert_eq!(language(Some("en"), os_locale), "en");
    }
}

#[test]
fn system_preference_uses_the_os_language_tag() {
    for os_locale in [
        "zh",
        "zh-Hans-CN",
        "zh-Hant-TW",
        "zh_CN.UTF-8",
        "ZH_hk",
        "zh@calendar=chinese",
    ] {
        assert_eq!(
            language(Some("system"), Some(os_locale)),
            "zh",
            "{os_locale}"
        );
    }
    for os_locale in [
        None,
        Some("en-US"),
        Some("de_DE"),
        Some("zhuang"),
        Some(""),
        Some("x-zh"),
    ] {
        assert_eq!(language(Some("system"), os_locale), "en");
    }
}

#[test]
fn unknown_raw_preferences_default_safely_to_english() {
    for preference in [Some("ZH"), Some("zh-CN"), Some("unexpected")] {
        assert_eq!(language(preference, Some("zh-Hans-CN")), "en");
    }
}

#[test]
fn missing_null_and_empty_preferences_follow_system_defaults() {
    for preference in [None, Some("")] {
        assert_eq!(language(preference, Some("zh-Hans-CN")), "zh");
        assert_eq!(language(preference, Some("en-US")), "en");
        assert_eq!(language(preference, None), "en");
    }
}
