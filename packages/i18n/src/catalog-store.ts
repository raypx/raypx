import type { Locale, Messages } from "./types.ts";

/** A bundled catalog, or a loader for one that ships in its own chunk. */
type CatalogSource = Messages | (() => Promise<Messages>);
export type CatalogSources = Readonly<Record<Locale, CatalogSource>>;
export type LoadedCatalogs = Readonly<Partial<Record<Locale, Messages>>>;

type CatalogRequest = Promise<Messages> & { status?: "fulfilled"; value?: Messages };

/** React's thenable fields let `use()` read a settled catalog without suspending. */
function settle(request: CatalogRequest, catalog: Messages) {
  request.status = "fulfilled";
  request.value = catalog;
}

/**
 * Loads each catalog once and notifies subscribers; bundled catalogs are ready at once.
 * Every catalog keeps one stable promise, so `use()` sees the same thenable on each render.
 */
export function createCatalogStore(sources: CatalogSources) {
  let loaded: LoadedCatalogs = Object.fromEntries(
    Object.entries(sources).filter(([, source]) => typeof source !== "function"),
  );
  const requests = new Map<Locale, CatalogRequest>();
  const listeners = new Set<() => void>();
  for (const [locale, catalog] of Object.entries(loaded) as [Locale, Messages][]) {
    const request: CatalogRequest = Promise.resolve(catalog);
    settle(request, catalog);
    requests.set(locale, request);
  }

  function load(locale: Locale): Promise<Messages> {
    const existing = requests.get(locale);
    if (existing) return existing;
    const source = sources[locale] as () => Promise<Messages>;
    const request: CatalogRequest = source().then(
      (catalog) => {
        settle(request, catalog);
        loaded = { ...loaded, [locale]: catalog };
        for (const listener of listeners) listener();
        return catalog;
      },
      (error: unknown) => {
        // A failed chunk request may succeed on the next switch.
        requests.delete(locale);
        throw error;
      },
    );
    requests.set(locale, request);
    return request;
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
