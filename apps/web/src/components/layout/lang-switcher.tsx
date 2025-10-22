import { Button } from "@raypx/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@raypx/ui/components/dropdown-menu";
import { cn } from "@raypx/ui/lib/utils";
import { Check, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AppLanguageKey } from "@/lib/i18n/constants";
import { useAppLanguage } from "@/state/app-store";

type LocaleConfig = {
  readonly code: AppLanguageKey;
  readonly name: string;
  readonly flag: string;
  readonly nativeName: string;
};

const locales: readonly LocaleConfig[] = [
  { code: "en", name: "English", flag: "🇺🇸", nativeName: "English" },
  { code: "zh", name: "Chinese", flag: "🇨🇳", nativeName: "中文" },
] as const;

export const LangSwitcher = () => {
  const { t } = useTranslation(["common"]);
  const { language: locale, setLanguage } = useAppLanguage();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          className="size-8 cursor-pointer rounded-full border border-border p-0.5"
          size="sm"
          variant="ghost"
        >
          <Languages className="size-3" />
          <span className="sr-only">{t("language")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {locales.map((loc) => (
          <DropdownMenuItem
            className={cn(
              "flex cursor-pointer items-center justify-between",
              locale === loc.code && "bg-accent",
            )}
            key={loc.code}
            onClick={() => setLanguage(loc.code)}
          >
            <div className="flex items-center gap-3">
              <span className="text-lg">{loc.flag}</span>
              <div className="flex flex-col">
                <span className="text-sm">{loc.nativeName}</span>
                <span className="text-muted-foreground text-xs">{loc.name}</span>
              </div>
            </div>
            {locale === loc.code && <Check className="h-4 w-4 text-primary" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
