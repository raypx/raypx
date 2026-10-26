import { useCallback, useEffect, useRef } from "react";
import type { MemoryReadOptions } from "./port.js";
const identities = new WeakMap<object, number>();
let sequence = 0;
export function memoryClientKey(client: object) {
  let id = identities.get(client);
  if (id === undefined) identities.set(client, (id = ++sequence));
  return id;
}
export function useMemoryRequests() {
  const active = useRef(true),
    controllers = useRef(new Set<AbortController>());
  useEffect(() => {
    active.current = true;
    const pending = controllers.current;
    return () => {
      active.current = false;
      for (const controller of pending) controller.abort();
      pending.clear();
    };
  }, []);
  const request = useCallback(async <T>(run: (options: MemoryReadOptions) => Promise<T>) => {
    if (!active.current) throw new DOMException("Cancelled", "AbortError");
    const controller = new AbortController();
    controllers.current.add(controller);
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15_000)]);
    let abort: () => void = () => {};
    try {
      const cancelled = new Promise<never>((_resolve, reject) => {
        abort = () => reject(signal.reason);
        signal.addEventListener("abort", abort, { once: true });
      });
      const value = await Promise.race([run({ signal }), cancelled]);
      signal.throwIfAborted();
      if (!active.current) throw new DOMException("Cancelled", "AbortError");
      return value;
    } finally {
      signal.removeEventListener("abort", abort);
      controllers.current.delete(controller);
    }
  }, []);
  const isActive = useCallback(() => active.current, []);
  return { isActive, request };
}
const codes = [
  "INVALID_CONTEXT",
  "CONTEXT_UNAVAILABLE",
  "CONTEXT_CONFLICT",
  "CONTEXT_NOT_FOUND",
  "CONTEXT_ARCHIVED",
  "CONTEXT_PROJECT_MISMATCH",
  "CONTEXT_REVISION_CONFLICT",
  "CONTEXT_TOO_LARGE",
  "CONTEXT_LIMIT",
  "IDEMPOTENCY_CONFLICT",
  "AUTH_REQUIRED",
  "RATE_LIMITED",
  "CONFLICT",
  "NOT_FOUND",
] as const;
export function memoryFailure(error: unknown) {
  const data =
    error && typeof error === "object"
      ? (error as { code?: string; message?: string; data?: { error?: { code?: string } } })
      : undefined;
  // Native IPC preserves a code prefix in Error.message; only accept exact known codes.
  const code =
    data?.data?.error?.code ??
    data?.code ??
    (typeof data?.message === "string" ? data.message.split(":", 1)[0] : undefined);
  return codes.find((item) => item === code) ?? "NETWORK_UNAVAILABLE";
}
