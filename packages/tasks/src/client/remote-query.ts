import { useEffect, useState } from "react";
import type { TaskClient } from "@raypx/client";

export type TaskWorkspaceClient = Pick<TaskClient, "tasks" | "approvals" | "subscribe"> & {
  devices: Pick<TaskClient["devices"], "list">;
};
export function useRemoteQuery<T>(
  load: (signal: AbortSignal) => Promise<T>,
  enabled: boolean,
  client: TaskWorkspaceClient,
) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let active = true,
      loading = false,
      queued = false;
    const controller = new AbortController();
    const poll = async () => {
      if (!active || document.hidden) return;
      if (loading) {
        queued = true;
        return;
      }
      loading = true;
      queued = false;
      try {
        const value = await load(AbortSignal.any([controller.signal, AbortSignal.timeout(10_000)]));
        if (active) {
          setData(value);
          setError(false);
        }
      } catch {
        if (active) setError(true);
      } finally {
        loading = false;
        if (queued && active) void poll();
      }
    };
    let unsubscribe: (() => void) | undefined;
    const visible = () => {
      unsubscribe?.();
      unsubscribe = undefined;
      if (!document.hidden) {
        unsubscribe = client.subscribe?.(() => void poll());
        void poll();
      }
    };
    document.addEventListener("visibilitychange", visible);
    visible();
    return () => {
      active = false;
      controller.abort();
      unsubscribe?.();
      document.removeEventListener("visibilitychange", visible);
    };
  }, [load, enabled, revision, client]);
  return {
    data: enabled ? data : undefined,
    error,
    refresh: () => setRevision((value) => value + 1),
  };
}
