import { createElement, useCallback, useEffect, useRef, useState } from "react";

import { IntlCatalogProvider, LocaleContextProvider } from "./runtime.js";
import { SUPPORTED_LOCALES } from "../constants.js";
import type { Locale, LocaleCatalogLoader, MessageCatalog } from "../types.js";

import type { LocaleProviderProps } from "../client.js";

export type AsyncI18nProviderProps = LocaleProviderProps & {
  messages: MessageCatalog;
  loadCatalog: LocaleCatalogLoader;
};

type AsyncLocaleCatalogOptions = Pick<
  AsyncI18nProviderProps,
  "locale" | "messages" | "loadCatalog" | "storage" | "onLocaleChange"
>;

type ActiveCatalog = {
  locale: Locale;
  messages: MessageCatalog;
};

export function AsyncI18nProvider({
  children,
  timeZone,
  formats,
  ...options
}: AsyncI18nProviderProps) {
  const { locale, messages, setLocale } = useAsyncLocaleCatalog(options);
  const runtime = {
    locale,
    ...(timeZone ? { timeZone } : {}),
    ...(formats ? { formats } : {}),
  };
  return createElement(
    LocaleContextProvider,
    { ...runtime, setLocale },
    createElement(IntlCatalogProvider, { ...runtime, messages }, children),
  );
}

function useAsyncLocaleCatalog({
  locale,
  messages,
  loadCatalog,
  storage,
  onLocaleChange,
}: AsyncLocaleCatalogOptions) {
  const [active, setActive] = useState<ActiveCatalog>({ locale, messages });
  const requestId = useRef(0);
  const activeRef = useRef(active);
  const propsRef = useRef({ locale, messages });
  const catalogCache = useRef(
    new Map<Locale, Promise<MessageCatalog>>([[locale, Promise.resolve(messages)]]),
  );
  const mountedRef = useRef(true);
  useEffect(() => {
    // React StrictMode replays effects during development; a replay is still a
    // live mount and must be allowed to commit catalog requests.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      requestId.current += 1;
    };
  }, []);
  const propsChanged = propsRef.current.locale !== locale || propsRef.current.messages !== messages;

  useEffect(() => {
    if (!propsChanged) return;
    const nextActive = { locale, messages };
    propsRef.current = nextActive;
    requestId.current += 1;
    activeRef.current = nextActive;
    catalogCache.current.clear();
    catalogCache.current.set(locale, Promise.resolve(messages));
    setActive(nextActive);
  }, [locale, messages, propsChanged]);

  const setLocale = useCallback(
    async (nextLocale: Locale) => {
      const currentRequestId = ++requestId.current;
      const currentLocale = propsChanged ? locale : activeRef.current.locale;
      if (!SUPPORTED_LOCALES.includes(nextLocale) || nextLocale === currentLocale) return;

      const nextMessages = await getOrLoadCatalog(catalogCache.current, nextLocale, loadCatalog);
      if (!mountedRef.current || currentRequestId !== requestId.current) return;
      try {
        storage?.write(nextLocale);
      } catch {
        // Persistence failures must not prevent a locale transition.
      }
      const nextActive = { locale: nextLocale, messages: nextMessages };
      activeRef.current = nextActive;
      setActive(nextActive);
      if (mountedRef.current) await onLocaleChange?.(nextLocale);
    },
    [loadCatalog, locale, onLocaleChange, propsChanged, storage],
  );

  return {
    locale: propsChanged ? locale : active.locale,
    messages: propsChanged ? messages : active.messages,
    setLocale,
  };
}

function getOrLoadCatalog(
  catalogCache: Map<Locale, Promise<MessageCatalog>>,
  locale: Locale,
  loadCatalog: LocaleCatalogLoader,
) {
  const cached = catalogCache.get(locale);
  if (cached) return cached;

  const catalogPromise = Promise.resolve()
    .then(() => loadCatalog(locale))
    .catch((error: unknown) => {
      if (catalogCache.get(locale) === catalogPromise) catalogCache.delete(locale);
      throw error;
    });
  catalogCache.set(locale, catalogPromise);
  return catalogPromise;
}
