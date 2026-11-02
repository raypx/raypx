import { MonitorIcon } from "@raypx/icons/monitor";
import { MoonIcon } from "@raypx/icons/moon";
import { SunIcon } from "@raypx/icons/sun";
import { ThemeIcon } from "@raypx/icons/theme";
import { useTranslations } from "@raypx/i18n/browser";
import { parseTheme, useTheme } from "@raypx/ui/themes";
import { IconButton } from "@raypx/ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@raypx/ui/components/ui/dropdown-menu";

const items = [
  { value: "light", icon: SunIcon },
  { value: "dark", icon: MoonIcon },
  { value: "system", icon: MonitorIcon },
] as const;

export function ThemeMenu() {
  const t = useTranslations("settings");
  const c = useTranslations("common");
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<IconButton label={t("appearance")} />}>
        <ThemeIcon aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label={t("appearance")} className="w-44">
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(parseTheme(value, "system"))}
        >
          {items.map(({ value, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} closeOnClick>
              <Icon aria-hidden="true" className="text-muted-foreground" />
              {c(value)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
