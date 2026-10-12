import { createContext, createElement, useContext, useMemo, type PropsWithChildren } from "react";
import { IntlProvider } from "use-intl";

import { formats } from "../formats.js";
import type { IntlRuntimeOptions, Locale, MessageCatalog, MessageTree } from "../types.js";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => Promise<void>;
  timeZone: string;
  formats: IntlRuntimeOptions["formats"];
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function LocaleContextProvider({
  children,
  locale,
  setLocale,
  timeZone = "UTC",
  formats: runtimeFormats,
}: PropsWithChildren<
  Pick<I18nContextValue, "locale" | "setLocale"> & Pick<IntlRuntimeOptions, "timeZone" | "formats">
>) {
  const context = useMemo(
    () => ({ locale, setLocale, timeZone, formats: runtimeFormats ?? formats }),
    [locale, setLocale, timeZone, runtimeFormats],
  );
  return createElement(I18nContext.Provider, { value: context }, children);
}

export function IntlCatalogProvider({
  children,
  locale,
  messages,
  timeZone = "UTC",
  formats: runtimeFormats,
}: PropsWithChildren<{ locale: Locale; messages: MessageCatalog } & IntlRuntimeOptions>) {
  return createElement(IntlProvider, {
    locale,
    // A fixed server timezone keeps SSR and hydration deterministic.
    timeZone,
    messages: messages as MessageTree,
    formats: {
      dateTime: (runtimeFormats?.dateTime ?? formats.dateTime) as never,
      list: (runtimeFormats?.list ?? formats.list) as never,
      number: (runtimeFormats?.number ?? formats.number) as never,
    },
    children,
  });
}

export function useI18nContext() {
  const context = useContext(I18nContext);
  if (!context) throw new Error("i18n hooks must be used within I18nProvider");
  return context;
}
