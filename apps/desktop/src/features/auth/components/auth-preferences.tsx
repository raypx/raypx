import { LOCALE_OPTIONS } from "@raypx/i18n";
import { useLanguagePreference, useTranslations } from "@raypx/i18n/browser";
import { parseLocalePreference } from "@raypx/i18n/preferences";
import { GlobalIcon } from "@raypx/icons/global";
import { MonitorIcon } from "@raypx/icons/monitor";
import { MoonIcon } from "@raypx/icons/moon";
import { SunIcon } from "@raypx/icons/sun";
import { IconButton } from "@raypx/ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@raypx/ui/components/ui/dropdown-menu";
import { parseTheme, useTheme } from "@raypx/ui/themes";

const themeIcons = { light: SunIcon, dark: MoonIcon, system: MonitorIcon };

export function AuthPreferences() {
  const t = useTranslations("settings");
  const c = useTranslations("common");
  const { preference, setPreference } = useLanguagePreference();
  const { theme, setTheme } = useTheme();
  const ThemeIcon = themeIcons[theme];
  return (
    <div className="ml-auto flex items-center gap-1 [--app-region:no-drag]">
      <DropdownMenu>
        <DropdownMenuTrigger render={<IconButton label={t("language")} />}>
          <GlobalIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-label={t("language")}>
          <DropdownMenuRadioGroup
            value={preference}
            onValueChange={(value) => setPreference(parseLocalePreference(value))}
          >
            <DropdownMenuRadioItem value="system" closeOnClick>
              {c("system")}
            </DropdownMenuRadioItem>
            {LOCALE_OPTIONS.map(({ value, nativeName }) => (
              <DropdownMenuRadioItem key={value} value={value} lang={value} closeOnClick>
                {nativeName}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger render={<IconButton label={t("appearance")} />}>
          <ThemeIcon aria-hidden="true" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" aria-label={t("appearance")}>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(value) => setTheme(parseTheme(value, theme))}
          >
            {(["light", "dark", "system"] as const).map((value) => {
              const Icon = themeIcons[value];
              return (
                <DropdownMenuRadioItem key={value} value={value} closeOnClick>
                  <Icon aria-hidden="true" className="text-muted-foreground" />
                  {c(value)}
                </DropdownMenuRadioItem>
              );
            })}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
