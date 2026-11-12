import { useSyncExternalStore, type ReactNode } from "react";
import { createBrowserLanguage, type BrowserLanguageProviderProps } from "./intl/browser.js";
import { createCatalogLanguageProvider } from "./catalog-provider.js";
import { createCatalogStore, type CatalogSources } from "./catalog-store.js";
import { DEFAULT_LOCALE } from "./constants.js";
import { normalizeLocale } from "./normalize.js";
import { LOCALE_PREFERENCE_KEY } from "./preferences.js";
import { createTranslations, IntlProvider, useLocale, useMessages } from "./react.js";
import { localeRuntime } from "./runtime.js";
import type { DynamicMessages, Locale, MessagesByLocale } from "./types.js";

export { getBrowserSystemLocales } from "./intl/browser.js";
export type { BrowserLanguageProviderProps, CatalogSources };

/** Bind one application's catalogs once at module scope, outside React renders. */
export function createBrowserI18n<M extends DynamicMessages>(sources: CatalogSources<M>) {
  const store = createCatalogStore(sources);
  const browser = createBrowserLanguage<Locale, DynamicMessages>(
    { LanguageProvider: createCatalogLanguageProvider(store), useLocale },
    localeRuntime,
    {
      // The catalog provider loads its own snapshot before mounting LanguageProvider.
      messages: store.snapshot() as MessagesByLocale,
      storageKey: LOCALE_PREFERENCE_KEY,
    },
  );
  function BrowserLanguageProvider({ children, ...props }: BrowserLanguageProviderProps<Locale>) {
    return (
      <browser.BrowserLanguageProvider {...props}>
        <DeviceTimeZone>{children}</DeviceTimeZone>
      </browser.BrowserLanguageProvider>
    );
  }
  return {
    BrowserLanguageProvider,
    useTranslations: createTranslations<M>(),
    /** Match the server language before hydration; subsequent loads share this cache. */
    preloadCatalog: (locale: string | null | undefined) =>
      store.load(normalizeLocale(locale) ?? DEFAULT_LOCALE),
  };
}

const noSubscription = () => () => {};
const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const serverTimeZone = () => "UTC";

/** UTC for SSR/hydration, then device time without remounting the provider. */
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

export {
  createTranslations,
  useLanguagePreference,
  useLocale,
  useFormatter,
  useNow,
  useTimeZone,
} from "./react.js";
