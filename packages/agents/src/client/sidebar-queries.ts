import type { QueryClient } from "@tanstack/react-query";

export function workspaceQueryKey(
  origin: string,
  accountId: string,
  name: string,
  spaceId: string | null = null,
) {
  return ["workspace", origin, accountId, spaceId, name] as const;
}

/** Cache read projections only; writes always reach the injected session port. */
export function cachedSidebarReads<T extends object>(
  port: T,
  cache: QueryClient,
  origin: string,
  accountId: string,
  namespace: string,
  reads: readonly (keyof T)[],
  writes: readonly (keyof T)[] = [],
): T {
  const methods = new Map<PropertyKey, unknown>();
  return new Proxy(port, {
    get(target, property, receiver) {
      const method: unknown = Reflect.get(target, property, receiver);
      if (typeof method !== "function") return method;
      const write = writes.includes(property as keyof T);
      if (!write && !reads.includes(property as keyof T)) return method;
      if (write) {
        if (!methods.has(property))
          methods.set(property, async (input: { spaceId?: string }) => {
            const result = await method.call(target, input);
            const filters = {
              predicate: ({ queryKey }: { queryKey: readonly unknown[] }) =>
                queryKey[0] === "workspace" &&
                queryKey[1] === origin &&
                queryKey[2] === accountId &&
                (namespace === "spaces" || queryKey[3] === (input.spaceId ?? null)) &&
                (queryKey[4] === namespace || String(queryKey[4]).startsWith(`${namespace}.`)),
            };
            // A read begun before the write must not restore its stale projection.
            await cache.cancelQueries(filters);
            await cache.invalidateQueries(filters);
            return result;
          });
        return methods.get(property);
      }
      if (!methods.has(property))
        methods.set(property, (input: { spaceId?: string }) => {
          const name =
            namespace === "spaces" && property === "list"
              ? "spaces"
              : `${namespace}.${String(property)}`;
          return cache.fetchQuery({
            queryKey: [
              ...workspaceQueryKey(origin, accountId, name, input.spaceId ?? null),
              ...(name === "spaces" ? [] : [input]),
            ],
            queryFn: () => method.call(target, input),
            staleTime: namespace === "notifications" ? 0 : 30_000,
          });
        });
      return methods.get(property);
    },
  });
}
