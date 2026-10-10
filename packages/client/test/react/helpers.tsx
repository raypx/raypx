import type { ReactNode } from "react";
import { createQueryClient } from "../../src/react/query.js";
import { ClientProvider } from "../../src/react/provider.js";

export function createClientWrapper() {
  const client = createQueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
  function wrapper({ children }: { children: ReactNode }) {
    return <ClientProvider client={client}>{children}</ClientProvider>;
  }
  return { client, wrapper };
}

export function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
