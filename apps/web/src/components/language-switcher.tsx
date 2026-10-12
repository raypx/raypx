import { Globe } from "@phosphor-icons/react";
import { useHydrated } from "@tanstack/react-router";
import { LOCALE_OPTIONS } from "@voidmix/i18n";
import { useLocale, useSetLocale, useTranslations } from "../i18n/client";
import type { Locale } from "@voidmix/i18n/types";
import { IconButton } from "@voidmix/ui/icon-button";
import { lazy, Suspense, useState } from "react";

const LazyLanguageMenu = lazy(async () => {
  const module = await import("./language-menu");
  return { default: module.LanguageMenu };
});

function preloadLanguageMenu() {
  void import("./language-menu");
}

export function LanguageSwitcher() {
  const hydrated = useHydrated();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const t = useTranslations("common");
  const [pending, setPending] = useState(false);
  const [open, setOpen] = useState(false);
  const [menuReady, setMenuReady] = useState(false);
  const currentLabel =
    LOCALE_OPTIONS.find((option) => option.value === locale)?.nativeName ?? locale;

  const openMenu = () => {
    setOpen(true);
    setMenuReady(true);
    preloadLanguageMenu();
  };
  const createTrigger = (onClick?: () => void) => (
    <IconButton
      label={`${t("language")}: ${currentLabel}`}
      aria-expanded={open}
      aria-haspopup="menu"
      disabled={!hydrated || pending}
      onClick={onClick}
      onFocus={preloadLanguageMenu}
      onPointerDown={preloadLanguageMenu}
      size="icon-sm"
      hint={`${t("language")}: ${currentLabel}`}
      variant="ghost"
    >
      <Globe aria-hidden="true" />
    </IconButton>
  );

  const onLocaleChange = (nextLocale: Locale) => {
    setPending(true);
    void setLocale(nextLocale)
      .catch(() => undefined)
      .finally(() => setPending(false));
  };

  if (!menuReady) return createTrigger(openMenu);

  return (
    <Suspense fallback={createTrigger(openMenu)}>
      <LazyLanguageMenu
        locale={locale}
        onLocaleChange={onLocaleChange}
        onOpenChange={setOpen}
        open={open}
        pending={pending}
        trigger={createTrigger()}
      />
    </Suspense>
  );
}
