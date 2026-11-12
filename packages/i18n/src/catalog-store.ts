import type { DynamicMessages, Locale, Messages } from "./types.js";

/** A bundled catalog, or a loader for one that ships in its own chunk. */
type CatalogSource<M extends DynamicMessages> = Messages<M> | (() => Promise<Messages<M>>);
export type CatalogSources<M extends DynamicMessages = DynamicMessages> = Readonly<
  Record<Locale, CatalogSource<M>>
>;
export type LoadedCatalogs<M extends DynamicMessages = DynamicMessages> = Readonly<
  Partial<Record<Locale, Messages<M>>>
>;

type CatalogRequest<M extends DynamicMessages> = Promise<Messages<M>> & {
  status?: "fulfilled";
  value?: Messages<M>;
};

/** React's thenable fields let `use()` read a settled catalog without suspending. */
function settle<M extends DynamicMessages>(request: CatalogRequest<M>, catalog: Messages<M>) {
  request.status = "fulfilled";
  request.value = catalog;
}

/**
 * Loads each catalog once and notifies subscribers; bundled catalogs are ready at once.
 * Every catalog keeps one stable promise, so `use()` sees the same thenable on each render.
 */
export function createCatalogStore<M extends DynamicMessages>(sources: CatalogSources<M>) {
  let loaded: LoadedCatalogs<M> = Object.fromEntries(
    Object.entries(sources).filter(([, source]) => typeof source !== "function"),
  );
  const requests = new Map<Locale, CatalogRequest<M>>();
  const listeners = new Set<() => void>();
  for (const [locale, catalog] of Object.entries(loaded) as [Locale, Messages<M>][]) {
    const request: CatalogRequest<M> = Promise.resolve(catalog);
    settle(request, catalog);
    requests.set(locale, request);
  }

  function load(locale: Locale): Promise<Messages<M>> {
    const existing = requests.get(locale);
    if (existing) return existing;
    const source = sources[locale] as () => Promise<Messages<M>>;
    const request: CatalogRequest<M> = source().then(
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
    snapshot: (): LoadedCatalogs<M> => loaded,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
