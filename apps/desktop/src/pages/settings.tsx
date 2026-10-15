import { Desktop, Moon, Sun, Translate } from "@phosphor-icons/react";
import { useTheme } from "@raypx/ui/theme/client";
import type { UserTheme } from "@raypx/ui/theme";
import { useLanguagePreference, useTranslations } from "@raypx/i18n/browser";
import type { LocalePreference } from "@raypx/i18n/preferences";

export function SettingsPage() {
  const t = useTranslations("settings");
  const c = useTranslations("common");
  const { theme, setTheme } = useTheme();
  const { preference, setPreference } = useLanguagePreference();
  return (
    <section className="page settings-page">
      <header className="page-heading">
        <h1>{t("title")}</h1>
        <p>{t("intro")}</p>
      </header>
      <section className="settings-section">
        <div>
          <h2>{t("appearance")}</h2>
          <p>{t("appearanceHint")}</p>
        </div>
        <fieldset className="theme-options">
          <legend className="sr-only">{t("appearance")}</legend>
          {(
            [
              ["light", Sun],
              ["dark", Moon],
              ["system", Desktop],
            ] as const
          ).map(([value, Icon]) => (
            <label className={`theme-option ${theme === value ? "selected" : ""}`} key={value}>
              <input
                type="radio"
                name="theme"
                value={value}
                checked={theme === value}
                onChange={() => setTheme(value as UserTheme)}
              />
              <span className={`theme-preview preview-${value}`} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
              <span className="theme-label">
                <Icon size={16} />
                {c(value)}
              </span>
            </label>
          ))}
        </fieldset>
      </section>
      <section className="settings-section">
        <div>
          <h2>{t("language")}</h2>
          <p>{t("languageHint")}</p>
        </div>
        <label className="language-select">
          <Translate size={18} />
          <span className="sr-only">{t("language")}</span>
          <select
            value={preference}
            onChange={(event) => setPreference(event.target.value as LocalePreference)}
          >
            <option value="system">{c("system")}</option>
            <option value="en">English</option>
            <option value="zh">简体中文</option>
          </select>
        </label>
      </section>
      <p className="settings-note">{t("localHint")}</p>
    </section>
  );
}
