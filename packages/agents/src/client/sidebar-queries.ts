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
): T {
  const methods = new Map<PropertyKey, unknown>();
  return new Proxy(port, {
    get(target, property, receiver) {
      const method: unknown = Reflect.get(target, property, receiver);
      if (typeof method !== "function" || !reads.includes(property as keyof T)) return method;
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
