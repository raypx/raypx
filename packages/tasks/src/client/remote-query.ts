import { useEffect } from "react";
import { type QueryKey, useQuery, useQueryClient } from "@tanstack/react-query";
import type { AgentEvent, TaskActivity, TaskChange } from "@raypx/contracts/tasks";
import { failureCode } from "./failure.js";
import type { TaskChangeSource, TaskWorkspacePort } from "../model/port.js";
import { waitForRead } from "./read.js";

/** Compatibility name for existing platform adapters. */
export type TaskWorkspaceClient = TaskWorkspacePort;
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
  client: TaskChangeSource,
  mergeEvents?: (events: AgentEvent[]) => TaskActivity[] | undefined,
  onRecovery?: () => void,
) {
  const queryClient = useQueryClient();
  const queryKey = ["tasks", clientScope(client), ...key];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => {
      const deadline = AbortSignal.any([signal, AbortSignal.timeout(10_000)]);
      deadline.throwIfAborted();
      return waitForRead(load(deadline), deadline);
    },
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
        onRecovery?.();
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
          onRecovery?.();
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
      // Freeze coverage before dropping or reattaching the source: newly resumed
      // live entries may arrive ahead of the authoritative checkpoint read.
      onRecovery?.();
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
  }, [queryClient, serializedKey, enabled, client, mergeEvents, onRecovery]);
  return {
    data: enabled ? query.data : undefined,
    error: query.isError,
    errorCode: failureCode(query.error),
    refreshing: query.isFetching,
    refresh: () => void query.refetch(),
  };
}
