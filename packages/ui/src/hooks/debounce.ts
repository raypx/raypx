import { useEffect, useState } from "react";

/** Returns the initial value during SSR, then publishes changes after a quiet interval. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  if (!Number.isFinite(delayMs) || delayMs < 0)
    throw new Error("Debounce delay must be finite and non-negative");
  const [debounced, setDebounced] = useState<T>(() => value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(() => value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
