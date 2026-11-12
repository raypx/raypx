import { useTranslations } from "../i18n.js";
import { TextSizeIcon } from "@raypx/icons/text-size";
import { GlobalIcon } from "@raypx/icons/global";
import { LanguagesIcon } from "@raypx/icons/languages";
import { MonitorIcon } from "@raypx/icons/monitor";
import { MoonIcon } from "@raypx/icons/moon";
import { SunIcon } from "@raypx/icons/sun";
import { LOCALE_OPTIONS } from "@raypx/i18n";
import { useLanguagePreference } from "@raypx/i18n/browser";
import { parseLocalePreference } from "@raypx/i18n/preferences";
import { IconButton } from "@raypx/ui/icon-button";
import { useTheme } from "@raypx/ui/themes";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@raypx/ui/components/ui/dropdown-menu";

const localeIcons = { en: TextSizeIcon, zh: LanguagesIcon };

export function LanguageMenu() {
  const t = useTranslations("settings");
  const { preference, setPreference } = useLanguagePreference();
  const items = [
    { value: "system", label: t("system"), icon: MonitorIcon },
    ...LOCALE_OPTIONS.map(({ value, nativeName }) => ({
      value,
      label: nativeName,
      icon: localeIcons[value],
    })),
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<IconButton label={t("language")} />}>
        <GlobalIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={24} aria-label={t("language")} className="w-44">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => setPreference(parseLocalePreference(value))}
        >
          {items.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem
              key={value}
              value={value}
              lang={value === "system" ? undefined : value}
              closeOnClick
            >
              <Icon aria-hidden="true" className="text-muted-foreground" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const themes = {
  light: { icon: SunIcon, next: "dark" },
  dark: { icon: MoonIcon, next: "system" },
  system: { icon: MonitorIcon, next: "light" },
} as const;

export function ThemeToggle() {
  const t = useTranslations("settings");
  const { theme, setTheme } = useTheme();
  const { icon: Icon, next } = themes[theme];
  return (
    <IconButton
      label={t("appearanceLabel", { theme: t(theme) })}
      hint={t("appearanceHint", { current: t(theme), next: t(next) })}
      onClick={() => setTheme(next)}
    >
      <Icon aria-hidden="true" />
    </IconButton>
  );
}
