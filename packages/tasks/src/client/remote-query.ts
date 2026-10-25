import { useEffect } from "react";
import { type QueryKey, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TaskClient } from "@raypx/client";
import type { AgentEvent, TaskActivity, TaskChange } from "@raypx/contracts/tasks";
import { failureCode } from "./failure.js";

export type TaskWorkspaceClient = Pick<
  TaskClient,
  "tasks" | "approvals" | "subscribe" | "observed"
> & {
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
  mergeEvents?: (events: AgentEvent[]) => TaskActivity[] | undefined,
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
    const scopeKey = (JSON.parse(serializedKey) as unknown[]).slice(2);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      if (!timer)
        timer = setTimeout(() => {
          timer = undefined;
          void queryClient.invalidateQueries({ queryKey: JSON.parse(serializedKey) });
        }, 100);
    };
    const notify = (change?: TaskChange) => {
      if (!change || change.type === "reset") {
        refresh();
        return;
      }
      if (change.type === "devices") {
        if (scopeKey[0] !== "task" && scopeKey[0] !== "approvals") refresh();
        return;
      }
      const events = change.events?.map((item) => item.event) ?? [];
      if (scopeKey[0] === "task") {
        const relevant = events.filter((event) => event.taskId === scopeKey[1]);
        if (!relevant.length) return;
        if (
          mergeEvents &&
          relevant.every((event) => event.kind === "activity" || event.kind === "activity_delta")
        ) {
          const activity = mergeEvents(relevant);
          if (activity) {
            queryClient.setQueryData(JSON.parse(serializedKey), (previous: unknown) =>
              previous && typeof previous === "object" ? { ...previous, activity } : previous,
            );
            return;
          }
        }
        refresh();
      } else if (
        scopeKey[0] !== "devices" &&
        events.some((event) => event.kind !== "activity" && event.kind !== "activity_delta")
      )
        refresh();
    };
    let unsubscribe: (() => void) | undefined;
    const visible = (event?: Event) => {
      unsubscribe?.();
      unsubscribe = document.hidden ? undefined : client.subscribe?.(notify);
      // useQuery performs the mount read; only becoming visible needs invalidation.
      if (!document.hidden && event) refresh();
    };
    document.addEventListener("visibilitychange", visible);
    visible();
    return () => {
      unsubscribe?.();
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [queryClient, serializedKey, enabled, client, mergeEvents]);
  return {
    data: enabled ? query.data : undefined,
    error: query.isError,
    errorCode: failureCode(query.error),
    refreshing: query.isFetching,
    refresh: () => void query.refetch(),
  };
}
