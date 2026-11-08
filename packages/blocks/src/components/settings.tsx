import { useId, type ReactNode } from "react";
import { GlobalIcon } from "@raypx/icons/global";
import { PaletteIcon } from "@raypx/icons/palette";
import type { IconComponent } from "@raypx/icons";
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
    <section className="@container/settings rounded-xl border border-border bg-card p-6 text-card-foreground @max-xl/main:p-4">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-2 max-w-prose text-sm text-muted-foreground">{description}</p>
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
      className="grid grid-cols-1 items-start gap-3 border-b border-border py-5 @min-xl/settings:grid-cols-[9rem_minmax(0,1fr)] @min-xl/settings:gap-6"
    >
      <div className="min-w-0 pt-1.5">
        <h2 id={id} className="flex items-center gap-2 text-sm font-medium">
          {Icon && <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />}
          {title}
        </h2>
        {description && (
          <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex min-w-0 flex-col items-start @min-xl/settings:items-end">{children}</div>
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
  const { preference, setPreference } = useLanguagePreference();
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
        <SelectTrigger aria-label={t("language")} className="w-52 max-w-full">
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
    </SettingsSection>
  );
}
