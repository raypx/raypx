import { Desktop, Moon, Sun } from "@phosphor-icons/react";
import { useTranslations } from "../i18n/client";
import {
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "@voidmix/ui/components/ui/dropdown-menu";
import { useTheme, type UserTheme } from "@voidmix/ui/theme";
import { themeOptions } from "./theme-options";

const themeIcons: Record<UserTheme, typeof Sun> = {
  dark: Moon,
  light: Sun,
  system: Desktop,
};

/**
 * The theme choices as menu items, so a standalone switcher and a larger
 * account menu can offer the same three options without restating them.
 */
export function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("common");

  return (
    <DropdownMenuRadioGroup onValueChange={(value) => setTheme(value as UserTheme)} value={theme}>
      {themeOptions.map((option) => {
        const Icon = themeIcons[option.value];
        return (
          <DropdownMenuRadioItem key={option.value} value={option.value}>
            <Icon aria-hidden="true" />
            {t(option.labelKey)}
          </DropdownMenuRadioItem>
        );
      })}
    </DropdownMenuRadioGroup>
  );
}
