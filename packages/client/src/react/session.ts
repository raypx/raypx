import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import type { getSession } from "../session.js";
import { sessionQueryOptions } from "./query.js";
import type { AsyncResource } from "./resource.js";

export interface SessionOptions {
  enabled?: boolean;
  /** Query identity scope; changing it never projects another scope's data. */
  key?: string | number;
}
/**
 * Shares the provider's session query. Anonymous user:null is a successful result;
 * disabled consumers immediately hide their projection. Cancel pauses this
 * consumer; it aborts the shared request only when no enabled consumer still
 * needs it. Retry resumes this consumer without duplicating shared work.
 */
export function useSession({ enabled = true, key = "current" }: SessionOptions = {}): AsyncResource<
  Awaited<ReturnType<typeof getSession>>
> {
  const client = useQueryClient();
  const [control, setControl] = useState({ key, enabled, paused: false });
  const changed = !Object.is(control.key, key) || control.enabled !== enabled;
  const current = changed ? { key, enabled, paused: false } : control;
  if (changed) setControl(current);
  const options = sessionQueryOptions(key);
  const query = useQuery({ ...options, enabled: enabled && !current.paused });
  const { isFetching, refetch } = query;
  // Query's own setOptions effect runs first, so isActive reflects this
  // consumer's committed paused state without inspecting observer internals.
  useEffect(() => {
    if (!current.paused) return;
    const queryKey = sessionQueryOptions(key).queryKey;
    const target = client.getQueryCache().find({ queryKey, exact: true });
    if (target && !target.isActive()) void client.cancelQueries({ queryKey, exact: true });
  }, [client, key, current.paused]);
  const retry = useCallback(() => {
    if (!enabled || (isFetching && !current.paused)) return;
    setControl({ key, enabled, paused: false });
    void refetch({ cancelRefetch: false });
  }, [enabled, key, isFetching, current.paused, refetch]);
  const cancel = useCallback(() => {
    setControl({ key, enabled, paused: true });
  }, [key, enabled]);
  return {
    status:
      !enabled || current.paused
        ? "idle"
        : query.isFetching || query.isPending
          ? "loading"
          : query.isError
            ? "error"
            : "success",
    data: enabled ? query.data : undefined,
    error: enabled && !current.paused ? (query.error ?? undefined) : undefined,
    retry,
    cancel,
  };
}
