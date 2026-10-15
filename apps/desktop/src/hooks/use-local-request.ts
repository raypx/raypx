import { useEffect, useEffectEvent } from "react";
import type { LocalMethod, LocalParams } from "@raypx/contracts/local";
import { isDesktop, localRequest } from "../lib/desktop";

const EMPTY_PARAMS = {};

interface LocalRequestOptions<T> {
  method: LocalMethod;
  /** Keep parameter objects stable with useMemo when their values can change. */
  params?: LocalParams<LocalMethod>;
  enabled?: boolean;
  refreshKey?: string | number;
  /** Reset view state on request changes, including when the request is disabled. */
  onReset?: () => void;
  onSuccess: (value: T) => void;
  onError?: () => void;
}

/** Runs a local read for the current inputs; stale responses never update the view. */
export function useLocalRequest<T>({
  method,
  params = EMPTY_PARAMS,
  enabled = true,
  refreshKey,
  onReset,
  onSuccess,
  onError,
}: LocalRequestOptions<T>): void {
  const reset = useEffectEvent(() => onReset?.());
  const succeed = useEffectEvent(onSuccess);
  const fail = useEffectEvent(() => onError?.());

  useEffect(() => {
    reset();
    if (!enabled || !isDesktop()) return;
    let active = true;
    void localRequest<T>(method, params)
      .then((value) => {
        if (active) succeed(value);
      })
      .catch(() => {
        if (active) fail();
      });
    return () => {
      active = false;
    };
  }, [method, params, enabled, refreshKey]);
}
