import {
  createElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { useTranslations as useIntlTranslations } from "use-intl";

import { IntlCatalogProvider, LocaleContextProvider, useI18nContext } from "./client/runtime.js";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from "./constants.js";
import { createFormatter, type Formatter } from "./formatter.js";
import type { IntlRuntimeOptions, Locale, LocaleStorage, MessagesByLocale } from "./types.js";
import type { Translator } from "./translator.js";

export type I18nProviderProps = LocaleProviderProps & { messages: MessagesByLocale };

export type LocaleProviderProps = PropsWithChildren<{
  locale: Locale;
  storage?: LocaleStorage;
  onLocaleChange?: (locale: Locale) => void | Promise<void>;
  timeZone?: string;
  formats?: IntlRuntimeOptions["formats"];
}>;

export function LocaleProvider({
  children,
  locale: initialLocale,
  storage,
  onLocaleChange,
  timeZone,
  formats,
}: LocaleProviderProps) {
  const [locale, setActiveLocale] = useState(initialLocale);
  const localeRef = useRef(initialLocale);
  const mountedRef = useRef(true);
  useEffect(() => {
    if (localeRef.current === initialLocale) return;
    localeRef.current = initialLocale;
    setActiveLocale(initialLocale);
  }, [initialLocale]);
  useEffect(() => {
    // React StrictMode mounts effects, cleans them up, then mounts them again.
    // Reset the flag on every setup so the second mount remains usable.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const setLocale = useCallback(
    async (nextLocale: Locale) => {
      if (!SUPPORTED_LOCALES.includes(nextLocale) || nextLocale === localeRef.current) return;
      localeRef.current = nextLocale;
      try {
        storage?.write(nextLocale);
      } catch {
        // Persistence failures must not prevent an in-memory locale change.
      }
      if (mountedRef.current) setActiveLocale(nextLocale);
      await onLocaleChange?.(nextLocale);
    },
    [onLocaleChange, storage],
  );

  return createElement(
    LocaleContextProvider,
    {
      locale,
      setLocale,
      ...(timeZone ? { timeZone } : {}),
      ...(formats ? { formats } : {}),
    },
    children,
  );
}

export function I18nProvider({ messages, children, ...localeProps }: I18nProviderProps) {
  return createElement(
    LocaleProvider,
    localeProps,
    createElement(
      IntlMessagesProvider,
      {
        messages,
        ...(localeProps.timeZone ? { timeZone: localeProps.timeZone } : {}),
        ...(localeProps.formats ? { formats: localeProps.formats } : {}),
      },
      children,
    ),
  );
}

function IntlMessagesProvider({
  children,
  messages,
  timeZone,
  formats,
}: PropsWithChildren<{ messages: MessagesByLocale } & IntlRuntimeOptions>) {
  const locale = useLocale();
  return createElement(
    IntlCatalogProvider,
    {
      locale,
      messages: messages[locale],
      ...(timeZone ? { timeZone } : {}),
      ...(formats ? { formats } : {}),
    },
    children,
  );
}

export function useLocale() {
  return useI18nContext().locale;
}

export function useSetLocale() {
  return useI18nContext().setLocale;
}

export function useTranslations(namespace?: string): Translator {
  return useIntlTranslations(namespace as never) as unknown as Translator;
}

export function useFormatter(options: IntlRuntimeOptions = {}): Formatter {
  const { locale, timeZone: contextTimeZone, formats: contextFormats } = useI18nContext();
  const timeZone = options.timeZone ?? contextTimeZone;
  const runtimeFormats = options.formats ?? contextFormats;
  return useMemo(
    () =>
      createFormatter(locale, { timeZone, ...(runtimeFormats ? { formats: runtimeFormats } : {}) }),
    [locale, runtimeFormats, timeZone],
  );
}

export { DEFAULT_LOCALE };
export { AsyncI18nProvider, type AsyncI18nProviderProps } from "./client/async-provider.js";
export { createBrowserLocaleStorage, createLocalStorageLocaleStorage } from "./client/storage.js";
export type {
  Locale,
  LocaleStorage,
  MessageCatalog,
  MessageTree,
  MessagesByLocale,
  LocaleCatalogLoader,
} from "./types.js";
