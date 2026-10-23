import { useEffect } from "react";
import { type QueryKey, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TaskClient } from "@raypx/client";

export type TaskWorkspaceClient = Pick<TaskClient, "tasks" | "approvals" | "subscribe"> & {
  devices: Pick<TaskClient["devices"], "list">;
};
const scopes = new WeakMap<object, number>();
let nextScope = 0;
// Web, the Desktop IPC adapter and the composite pending client share one QueryClient.
function clientScope(client: object) {
  let scope = scopes.get(client);
  if (scope === undefined) scopes.set(client, (scope = ++nextScope));
  return scope;
}
/** Read remote task state, refreshed by relay notifications while the page is visible. */
export function useRemoteQuery<T>(
  key: QueryKey,
  load: (signal: AbortSignal) => Promise<T>,
  enabled: boolean,
  client: TaskWorkspaceClient,
) {
  const queryClient = useQueryClient();
  const queryKey = ["tasks", clientScope(client), ...key];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => load(AbortSignal.any([signal, AbortSignal.timeout(10_000)])),
    enabled,
    staleTime: 0,
    refetchOnWindowFocus: "always",
  });
  const serializedKey = JSON.stringify(queryKey);
  useEffect(() => {
    if (!enabled) return;
    const refresh = () =>
      void queryClient.invalidateQueries({ queryKey: JSON.parse(serializedKey) });
    let unsubscribe: (() => void) | undefined;
    const visible = () => {
      unsubscribe?.();
      unsubscribe = document.hidden ? undefined : client.subscribe?.(refresh);
    };
    document.addEventListener("visibilitychange", visible);
    visible();
    return () => {
      unsubscribe?.();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [queryClient, serializedKey, enabled, client]);
  return {
    data: enabled ? query.data : undefined,
    error: query.isError,
    refreshing: query.isFetching,
    refresh: () => void query.refetch(),
  };
}
