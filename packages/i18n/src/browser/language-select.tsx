import type { ReactNode } from "react";
import { useLanguagePreference } from "../language-provider.js";
import { useTranslations } from "../react.js";
import { parseLocalePreference } from "../preferences.js";
import { LOCALE_OPTIONS } from "../constants.js";

export function LanguageSelect({ icon }: { icon?: ReactNode }) {
  const t = useTranslations("settings");
  const c = useTranslations("common");
  const { preference, setPreference } = useLanguagePreference();
  return (
    <label
      className="flex items-center gap-[9px] rounded-[8px] border border-border px-3"
      data-slot="language-select"
    >
      {icon}
      <span className="sr-only">{t("language")}</span>
      <select
        className="min-w-[160px] border-0 pl-0"
        value={preference}
        onChange={(event) => setPreference(parseLocalePreference(event.target.value))}
      >
        <option value="system">{c("system")}</option>
        {LOCALE_OPTIONS.map(({ value, nativeName }) => (
          <option key={value} value={value}>
            {nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}
