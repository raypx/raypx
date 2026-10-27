import { useSyncExternalStore, type ReactNode } from "react";
import { createBrowserLanguage, type BrowserLanguageProviderProps } from "@raypx-kit/intl/browser";
import { catalogs } from "#catalogs";
import { createCatalogLanguageProvider } from "./catalog-provider.js";
import { createCatalogStore } from "./catalog-store.js";
import { DEFAULT_LOCALE } from "./constants.js";
import { normalizeLocale } from "./normalize.js";
import { LOCALE_PREFERENCE_KEY } from "./preferences.js";
import { IntlProvider, useLocale, useMessages } from "./react.js";
import { localeRuntime } from "./runtime.js";
import type en from "./messages/en.js";
import type { Locale, MessagesByLocale } from "./types.js";

const store = createCatalogStore(catalogs);

const browser = createBrowserLanguage<Locale, typeof en>(
  { LanguageProvider: createCatalogLanguageProvider(store), useLocale },
  localeRuntime,
  {
    // The catalog provider reads the store; this snapshot only satisfies the adapter.
    messages: store.snapshot() as MessagesByLocale,
    storageKey: LOCALE_PREFERENCE_KEY,
    // Values written before the product rename keep working once.
    legacyStorageKeys: ["voidmix_locale"],
  },
);

export const { getBrowserSystemLocales } = browser;
export type { BrowserLanguageProviderProps };

/** Resolves once a language's catalog is ready, such as the server language before hydration. */
export function preloadCatalog(locale: string | null | undefined) {
  return store.load(normalizeLocale(locale) ?? DEFAULT_LOCALE);
}

/**
 * Server and hydration renders format in UTC; after mount, absolute times follow
 * the device time zone. The provider stays mounted so children never remount.
 */
const noSubscription = () => () => {};
const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const serverTimeZone = () => "UTC";

function DeviceTimeZone({ children }: { children?: ReactNode }) {
  const locale = useLocale();
  const catalog = useMessages();
  const timeZone = useSyncExternalStore(noSubscription, deviceTimeZone, serverTimeZone);
  return (
    <IntlProvider locale={locale} messages={catalog} timeZone={timeZone}>
      {children}
    </IntlProvider>
  );
}

export function BrowserLanguageProvider({
  children,
  ...props
}: BrowserLanguageProviderProps<Locale>) {
  return (
    <browser.BrowserLanguageProvider {...props}>
      <DeviceTimeZone>{children}</DeviceTimeZone>
    </browser.BrowserLanguageProvider>
  );
}

/** Restore device storage only; native composition must not inherit browser cookies. */
export const readBrowserPreference = browser.preferences.read;
export { useLanguagePreference } from "./react.js";
export {
  useTranslations,
  useLocale,
  useFormatter,
  useNow,
  useTimeZone,
  useMessages,
} from "./react.js";
