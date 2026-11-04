import { TextSizeIcon } from "@raypx/icons/text-size";
import { GlobalIcon } from "@raypx/icons/global";
import { LanguagesIcon } from "@raypx/icons/languages";
import { MonitorIcon } from "@raypx/icons/monitor";
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

const localeIcons = { en: TextSizeIcon, zh: LanguagesIcon };

export function LanguageMenu() {
  const t = useTranslations("settings");
  const c = useTranslations("common");
  const { preference, setPreference } = useLanguagePreference();
  const items = [
    { value: "system", label: c("system"), icon: MonitorIcon },
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
