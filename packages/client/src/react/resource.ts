import { useCallback, useEffect, useRef, useState } from "react";
import { abortable } from "./abortable.js";

export type AsyncResourceStatus = "idle" | "loading" | "success" | "error";
export interface AsyncResourceOptions<T> {
  /** All inputs affecting the result must be represented by this identity. */
  key: string | number;
  /** Changing this function alone does not reload; retry uses its latest version. */
  load: (signal: AbortSignal) => T | Promise<T>;
  enabled?: boolean;
}
export interface AsyncResource<T> {
  readonly status: AsyncResourceStatus;
  readonly data: T | undefined;
  readonly error: unknown;
  /** Revalidates the current key, retaining its prior data; a pending retry is ignored. */
  readonly retry: () => void;
  /** Stops the current load and becomes idle, retaining data for the same key. */
  readonly cancel: () => void;
}
interface ResourceState<T> {
  key: string | number;
  enabled: boolean;
  status: AsyncResourceStatus;
  data: T | undefined;
  error: unknown;
}
const initial = <T>(key: string | number, enabled: boolean): ResourceState<T> => ({
  key,
  enabled,
  status: enabled ? "loading" : "idle",
  data: undefined,
  error: undefined,
});

/**
 * Loads after mounting, cancels on key/enabled changes and ignores late results.
 * SSR performs no work. Key changes and disabled state never expose prior data.
 * This is per-consumer state, with explicit retry rather than a shared cache.
 */
export function useAsyncResource<T>({
  key,
  load,
  enabled = true,
}: AsyncResourceOptions<T>): AsyncResource<T> {
  const [state, setState] = useState<ResourceState<T>>(() => initial(key, enabled));
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  // React restarts this render before committing children, so a new identity can
  // never render another key's data while waiting for the effect cleanup.
  const identityChanged = !Object.is(state.key, key) || state.enabled !== enabled;
  const currentState = identityChanged ? initial<T>(key, enabled) : state;
  if (identityChanged) setState(currentState);

  useEffect(() => {
    loadRef.current = load;
  }, [load]);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    void abortable(() => loadRef.current(controller.signal), controller.signal).then(
      (data) => {
        if (!controller.signal.aborted)
          setState((current) =>
            Object.is(current.key, key) && current.enabled
              ? { ...current, status: "success", data, error: undefined }
              : current,
          );
      },
      (error: unknown) => {
        if (!controller.signal.aborted)
          setState((current) =>
            Object.is(current.key, key) && current.enabled
              ? { ...current, status: "error", error }
              : current,
          );
      },
    );
    return () => {
      controller.abort();
      if (controllerRef.current === controller) controllerRef.current = undefined;
    };
  }, [key, enabled, attempt]);

  const retry = useCallback(() => {
    if (!enabled || currentState.status === "loading") return;
    controllerRef.current?.abort();
    setState((current) => ({ ...current, status: "loading", error: undefined }));
    setAttempt((value) => value + 1);
  }, [enabled, currentState.status]);
  const cancel = useCallback(() => {
    controllerRef.current?.abort();
    setState((current) => ({ ...current, status: "idle", error: undefined }));
  }, []);
  return {
    status: currentState.status,
    data: currentState.data,
    error: currentState.error,
    retry,
    cancel,
  };
}
