import { useCallback, useEffect, useRef, useState } from "react";
import { abortable } from "./abortable.js";

export type MutationStatus = "idle" | "pending" | "success" | "error";
/** Always inspect status before treating a mutation as successful. */
export type MutationOutcome<T> =
  | { readonly status: "success"; readonly data: T }
  | { readonly status: "error"; readonly error: unknown }
  | { readonly status: "cancelled" };
export interface MutationOptions<Input, Output> {
  execute: (input: Input, signal: AbortSignal) => Output | Promise<Output>;
}
export interface Mutation<Input, Output> {
  readonly status: MutationStatus;
  readonly data: Output | undefined;
  readonly error: unknown;
  /** Resolves an explicit outcome; superseded, reset and unmounted work is cancelled. */
  readonly mutate: (input: Input) => Promise<MutationOutcome<Output>>;
  readonly cancel: () => void;
  readonly reset: () => void;
}
interface MutationState<T> {
  status: MutationStatus;
  data: T | undefined;
  error: unknown;
}
const idle = <T>(): MutationState<T> => ({ status: "idle", data: undefined, error: undefined });

/**
 * Executes writes on demand with latest-invocation-wins state and explicit outcomes.
 * Cancellation settles promptly even for non-cooperative work, but cannot undo a
 * write already accepted by a server; endpoint idempotency remains a server concern.
 */
export function useMutation<Input, Output>({
  execute,
}: MutationOptions<Input, Output>): Mutation<Input, Output> {
  const [state, setState] = useState<MutationState<Output>>(idle);
  const controllerRef = useRef<AbortController | undefined>(undefined);
  const generation = useRef(0);
  const mounted = useRef(false);
  const stop = useCallback(() => {
    generation.current++;
    controllerRef.current?.abort();
    controllerRef.current = undefined;
  }, []);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop();
    };
  }, [stop]);

  const mutate = useCallback(
    async (input: Input): Promise<MutationOutcome<Output>> => {
      if (!mounted.current) return { status: "cancelled" };
      controllerRef.current?.abort();
      const id = ++generation.current;
      const controller = new AbortController();
      controllerRef.current = controller;
      setState({ status: "pending", data: undefined, error: undefined });
      try {
        const data = await abortable(() => execute(input, controller.signal), controller.signal);
        if (!mounted.current || controller.signal.aborted || generation.current !== id)
          return { status: "cancelled" };
        setState({ status: "success", data, error: undefined });
        return { status: "success", data };
      } catch (error) {
        if (!mounted.current || controller.signal.aborted || generation.current !== id)
          return { status: "cancelled" };
        setState({ status: "error", data: undefined, error });
        return { status: "error", error };
      } finally {
        if (controllerRef.current === controller) controllerRef.current = undefined;
      }
    },
    [execute],
  );

  const cancel = useCallback(() => {
    stop();
    if (mounted.current) setState((current) => ({ ...current, status: "idle", error: undefined }));
  }, [stop]);
  const reset = useCallback(() => {
    stop();
    if (mounted.current) setState(idle());
  }, [stop]);
  return { ...state, mutate, cancel, reset };
}
