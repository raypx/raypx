import { useId, type ReactNode } from "react";
import { Languages } from "lucide-react";
import { LOCALE_OPTIONS } from "@raypx/i18n";
import { useLanguagePreference, useTranslations } from "@raypx/i18n/browser";
import { parseLocalePreference } from "@raypx/i18n/preferences";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@raypx/ui/components/ui/select";
import { ThemePicker } from "@raypx/ui/themes";

export interface SettingsPageProps {
  title: string;
  description?: string;
  /** Closing note below every section. */
  footnote?: string;
  children: ReactNode;
}

export function SettingsPage({ title, description, footnote, children }: SettingsPageProps) {
  return (
    <section>
      <header className="mb-10">
        <h1>{title}</h1>
        {description && (
          <p className="mt-[9px] max-w-[65ch] text-muted-foreground">{description}</p>
        )}
      </header>
      {children}
      {footnote && <p className="mt-6 text-xs text-muted-foreground">{footnote}</p>}
    </section>
  );
}

export interface SettingsSectionProps {
  title: string;
  description?: string;
  /** The control placed beside the heading. */
  children: ReactNode;
}

export function SettingsSection({ title, description, children }: SettingsSectionProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex items-start justify-between gap-8 border-b border-border pt-7 pb-8 first-of-type:pt-0 @max-4xl/main:flex-col @max-4xl/main:gap-5.5"
    >
      <div>
        <h2 id={id} className="mb-1.5 text-[15px]">
          {title}
        </h2>
        {description && <p className="text-[13px] text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  );
}

/** Device theme preference; requires the UI ThemeProvider. */
export function AppearanceSettings() {
  const t = useTranslations("settings");
  const c = useTranslations("common");
  return (
    <SettingsSection title={t("appearance")} description={t("appearanceHint")}>
      <ThemePicker
        label={t("appearance")}
        labels={{ light: c("light"), dark: c("dark"), system: c("system") }}
      />
    </SettingsSection>
  );
}

/** Device language preference; requires the i18n browser language provider. */
export function LanguageSettings() {
  const t = useTranslations("settings");
  const c = useTranslations("common");
  const { preference, setPreference } = useLanguagePreference();
  const items = [
    { value: "system", label: c("system") },
    ...LOCALE_OPTIONS.map(({ value, nativeName }) => ({ value, label: nativeName })),
  ];
  return (
    <SettingsSection title={t("language")} description={t("languageHint")}>
      <Select
        items={items}
        value={preference}
        onValueChange={(value) => setPreference(parseLocalePreference(value))}
      >
        <SelectTrigger aria-label={t("language")} className="w-52 max-w-full">
          <Languages aria-hidden="true" className="text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end" alignItemWithTrigger={false}>
          <SelectGroup>
            {items.map(({ value, label }) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </SettingsSection>
  );
}
