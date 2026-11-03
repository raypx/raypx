import { MonitorIcon } from "@raypx/icons/monitor";
import { MoonIcon } from "@raypx/icons/moon";
import { SunIcon } from "@raypx/icons/sun";
import { useTranslations } from "@raypx/i18n/browser";
import { useTheme } from "@raypx/ui/themes";
import { IconButton } from "@raypx/ui/icon-button";

const themes = {
  light: { icon: SunIcon, next: "dark" },
  dark: { icon: MoonIcon, next: "system" },
  system: { icon: MonitorIcon, next: "light" },
} as const;

export function ThemeToggle() {
  const t = useTranslations("settings");
  const c = useTranslations("common");
  const { theme, setTheme } = useTheme();
  const { icon: Icon, next } = themes[theme];
  return (
    <IconButton
      label={`${t("appearance")}: ${c(theme)}`}
      hint={`${c(theme)} → ${c(next)}`}
      onClick={() => setTheme(next)}
    >
      <Icon aria-hidden="true" />
    </IconButton>
  );
}
