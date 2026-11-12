import type { DynamicMessages, Locale, Messages } from "./types.js";

/** A bundled catalog, or a loader for one that ships in its own chunk. */
type CatalogSource<M extends DynamicMessages> = Messages<M> | (() => Promise<Messages<M>>);
export type CatalogSources<M extends DynamicMessages = DynamicMessages> = Readonly<
  Record<Locale, CatalogSource<M>>
>;
type CatalogSnapshot<M extends DynamicMessages> = Readonly<{
  loaded: Readonly<Partial<Record<Locale, Messages<M>>>>;
  failed: ReadonlySet<Locale>;
}>;

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
 * Each attempt keeps a stable promise so `use()` sees the same thenable on each render.
 */
export function createCatalogStore<M extends DynamicMessages>(sources: CatalogSources<M>) {
  let snapshot: CatalogSnapshot<M> = {
    loaded: Object.fromEntries(
      Object.entries(sources).filter(([, source]) => typeof source !== "function"),
    ),
    failed: new Set(),
  };
  const requests = new Map<Locale, CatalogRequest<M>>();
  const listeners = new Set<() => void>();
  for (const [locale, catalog] of Object.entries(snapshot.loaded) as [Locale, Messages<M>][]) {
    const request: CatalogRequest<M> = Promise.resolve(catalog);
    settle(request, catalog);
    requests.set(locale, request);
  }

  function publish(next: CatalogSnapshot<M>) {
    snapshot = next;
    for (const listener of listeners) listener();
  }

  function load(locale: Locale): Promise<Messages<M>> {
    const existing = requests.get(locale);
    if (existing && !snapshot.failed.has(locale)) return existing;
    const source = sources[locale] as () => Promise<Messages<M>>;
    const request: CatalogRequest<M> = Promise.resolve()
      .then(source)
      .then(
        (catalog) => {
          settle(request, catalog);
          publish({ ...snapshot, loaded: { ...snapshot.loaded, [locale]: catalog } });
          return catalog;
        },
        (error: unknown) => {
          // A failed chunk request may succeed on the next switch.
          publish({ ...snapshot, failed: new Set([...snapshot.failed, locale]) });
          throw error;
        },
      );
    requests.set(locale, request);
    if (snapshot.failed.has(locale)) {
      const failed = new Set(snapshot.failed);
      failed.delete(locale);
      publish({ ...snapshot, failed });
    }
    return request;
  }

  return {
    load,
    // Suspense observes the current promise even when it has rejected. Only an
    // explicit load starts a new attempt.
    read: (locale: Locale) => requests.get(locale) ?? load(locale),
    snapshot: () => snapshot,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
