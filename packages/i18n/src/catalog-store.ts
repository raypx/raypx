import type { Locale, Messages } from "./types.js";

/** A bundled catalog, or a loader for one that ships in its own chunk. */
type CatalogSource = Messages | (() => Promise<Messages>);
export type CatalogSources = Readonly<Record<Locale, CatalogSource>>;
export type LoadedCatalogs = Readonly<Partial<Record<Locale, Messages>>>;

/** Loads each catalog once and notifies subscribers; bundled catalogs are ready at once. */
export function createCatalogStore(sources: CatalogSources) {
  let loaded: LoadedCatalogs = Object.fromEntries(
    Object.entries(sources).filter(([, source]) => typeof source !== "function"),
  );
  const pending = new Map<Locale, Promise<Messages>>();
  const listeners = new Set<() => void>();

  function load(locale: Locale): Promise<Messages> {
    const ready = loaded[locale];
    if (ready) return Promise.resolve(ready);
    const existing = pending.get(locale);
    if (existing) return existing;
    const source = sources[locale] as () => Promise<Messages>;
    const promise = source().then(
      (catalog) => {
        loaded = { ...loaded, [locale]: catalog };
        for (const listener of listeners) listener();
        return catalog;
      },
      (error: unknown) => {
        // A failed chunk request may succeed on the next switch.
        pending.delete(locale);
        throw error;
      },
    );
    pending.set(locale, promise);
    return promise;
  }

  return {
    load,
    snapshot: (): LoadedCatalogs => loaded,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
