import {
  use,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
import type { createCatalogStore } from "./catalog-store.js";
import { intlClient } from "./react.js";
import { localeRuntime } from "./runtime.js";
import type { MessagesByLocale } from "./types.js";

type CatalogStore = ReturnType<typeof createCatalogStore>;
type LanguageProviderProps = ComponentProps<typeof intlClient.LanguageProvider>;

/**
 * Binds LanguageProvider to a catalog store. A switch keeps showing the last ready
 * catalog while the selected one loads, so it never suspends the tree; only a first
 * render without any ready catalog suspends.
 */
export function createCatalogLanguageProvider(store: CatalogStore) {
  return function CatalogLanguageProvider(props: LanguageProviderProps) {
    const locale = localeRuntime.resolvePreference(props.preference, props.systemLocales);
    const loaded = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
    const ready = loaded[locale];
    const [lastReady, setLastReady] = useState(locale);
    if (ready && lastReady !== locale) setLastReady(locale);
    const current = ready ?? loaded[lastReady] ?? use(store.load(locale));
    useEffect(() => {
      // A failed load keeps the previous catalog; the next switch retries.
      if (!ready) store.load(locale).catch(() => {});
    }, [ready, locale]);
    const messages = useMemo(
      () => ({ ...loaded, [locale]: current }) as MessagesByLocale,
      [loaded, locale, current],
    );
    return <intlClient.LanguageProvider {...props} messages={messages} />;
  };
}
