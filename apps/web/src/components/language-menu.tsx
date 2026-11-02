import { ALargeSmall, Languages, Monitor } from "lucide-react";
import { LOCALE_OPTIONS } from "@raypx/i18n";
import { useLanguagePreference, useTranslations } from "@raypx/i18n/browser";
import { parseLocalePreference } from "@raypx/i18n/preferences";
import { IconButton } from "@raypx/ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@raypx/ui/components/ui/dropdown-menu";

const localeIcons = { en: ALargeSmall, zh: Languages };

export function LanguageMenu() {
  const t = useTranslations("settings");
  const c = useTranslations("common");
  const { preference, setPreference } = useLanguagePreference();
  const items = [
    { value: "system", label: c("system"), icon: Monitor },
    ...LOCALE_OPTIONS.map(({ value, nativeName }) => ({
      value,
      label: nativeName,
      icon: localeIcons[value],
    })),
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<IconButton label={t("language")} />}>
        <Languages aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label={t("language")} className="w-44">
        <DropdownMenuRadioGroup
          value={preference}
          onValueChange={(value) => setPreference(parseLocalePreference(value))}
        >
          {items.map(({ value, label, icon: Icon }) => (
            <DropdownMenuRadioItem key={value} value={value} closeOnClick>
              <Icon aria-hidden="true" className="text-muted-foreground" />
              {label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
