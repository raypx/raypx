import { useTranslations } from "../i18n.js";
import { useId, useRef, type ReactNode } from "react";
import { GlobalIcon } from "@raypx/icons/global";
import { PaletteIcon } from "@raypx/icons/palette";
import type { IconComponent } from "@raypx/icons";
import { LOCALE_OPTIONS } from "@raypx/i18n";
import { useLanguagePreference } from "@raypx/i18n/browser";
import { parseLocalePreference } from "@raypx/i18n/preferences";
import { Button } from "@raypx/ui/components/ui/button";
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
    <section className="@container/settings flex min-w-0 flex-col text-foreground">
      <header className="mb-2 border-b border-border pb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
        {description && (
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </header>
      {children}
      {footnote && <p className="mt-6 text-xs leading-relaxed text-muted-foreground">{footnote}</p>}
    </section>
  );
}

export interface SettingsSectionProps {
  title: string;
  description?: string;
  icon?: IconComponent;
  /** The control placed beside the heading. */
  children: ReactNode;
}

export function SettingsSection({
  title,
  description,
  icon: Icon,
  children,
}: SettingsSectionProps) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="grid min-w-0 grid-cols-1 items-start gap-3 border-b border-border py-5 last:border-b-0 @min-xl/settings:grid-cols-[minmax(9rem,1fr)_minmax(0,1.4fr)] @min-xl/settings:gap-8"
    >
      <div className="min-w-0 pt-1.5">
        <h2 id={id} className="flex items-center gap-2 text-sm font-medium">
          {Icon && <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
          {title}
        </h2>
        {description && (
          <p className="mt-1 max-w-prose text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      <div className="flex min-w-0 flex-col items-start gap-2 @min-xl/settings:items-end">
        {children}
      </div>
    </section>
  );
}

/** Device theme preference; requires the UI ThemeProvider. */
export function AppearanceSettings() {
  const t = useTranslations("settings");
  return (
    <SettingsSection title={t("appearance")} icon={PaletteIcon}>
      <ThemePicker
        label={t("appearance")}
        labels={{ light: t("light"), dark: t("dark"), system: t("system") }}
      />
    </SettingsSection>
  );
}

/** Device language preference; requires the i18n browser language provider. */
export function LanguageSettings() {
  const t = useTranslations("settings");
  const { preference, setPreference, loadStatus, retry } = useLanguagePreference();
  const trigger = useRef<HTMLButtonElement>(null);
  const items = [
    { value: "system", label: t("system") },
    ...LOCALE_OPTIONS.map(({ value, nativeName }) => ({ value, label: nativeName })),
  ];
  return (
    <SettingsSection title={t("language")} icon={GlobalIcon}>
      <Select
        items={items}
        value={preference}
        onValueChange={(value) => setPreference(parseLocalePreference(value))}
      >
        <SelectTrigger ref={trigger} aria-label={t("language")} className="w-52 max-w-full">
          <GlobalIcon aria-hidden="true" className="text-muted-foreground" />
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
      <span
        aria-live="polite"
        aria-atomic="true"
        className="text-xs text-muted-foreground empty:sr-only"
      >
        {loadStatus === "loading" && t("languageLoading")}
        {loadStatus === "failed" && t("languageLoadFailed")}
      </span>
      {loadStatus === "failed" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            trigger.current?.focus();
            retry();
          }}
        >
          {t("retryLanguage")}
        </Button>
      )}
    </SettingsSection>
  );
}
