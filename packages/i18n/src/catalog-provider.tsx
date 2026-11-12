import {
  use,
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  type ComponentProps,
} from "react";
import type { createCatalogStore } from "./catalog-store.js";
import { DEFAULT_LOCALE } from "./constants.js";
import { LanguageProvider } from "./react.js";
import { resolveLocalePreference } from "./preferences.js";
import type { DynamicMessages } from "./types.js";

type CatalogLanguageProviderProps = Omit<
  ComponentProps<typeof LanguageProvider>,
  "locale" | "messages" | "referenceMessages" | "loadStatus" | "retry"
> & {
  systemLocales: readonly string[];
};

/**
 * Binds LanguageProvider to a catalog store. A switch keeps showing the last ready
 * catalog while the selected one loads, so it never suspends the tree; only a first
 * render without any ready catalog suspends.
 */
export function createCatalogLanguageProvider<M extends DynamicMessages>(
  store: ReturnType<typeof createCatalogStore<M>>,
) {
  return function CatalogLanguageProvider({
    systemLocales,
    ...props
  }: CatalogLanguageProviderProps) {
    const requested = resolveLocalePreference(props.preference, systemLocales);
    const { loaded, failed } = useSyncExternalStore(
      store.subscribe,
      store.snapshot,
      store.snapshot,
    );
    const ready = loaded[requested] !== undefined;
    const [lastReady, setLastReady] = useState(requested);
    if (ready && lastReady !== requested) setLastReady(requested);
    const locale = !ready && loaded[lastReady] ? lastReady : requested;
    // use() runs on every render: a render that suspended must call it again when it
    // resumes, and the store's settled promise returns its catalog synchronously.
    const messages = use(store.read(locale));
    const retry = useCallback(() => {
      // The store publishes failures separately from the catalog promise.
      void store.load(requested).catch(() => {});
    }, [requested]);
    useEffect(() => {
      if (!ready) retry();
    }, [ready, retry]);
    const pendingStatus = failed.has(requested) ? "failed" : "loading";
    const referenceMessages = loaded[DEFAULT_LOCALE];
    return (
      <LanguageProvider
        {...props}
        locale={locale}
        messages={messages}
        {...(referenceMessages === undefined ? {} : { referenceMessages })}
        loadStatus={ready ? "ready" : pendingStatus}
        retry={retry}
      />
    );
  };
}
