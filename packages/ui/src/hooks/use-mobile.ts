import { useSyncExternalStore } from "react";

const query = "(max-width: 760px)";
function subscribe(onChange: () => void) {
  const media = window.matchMedia?.(query);
  media?.addEventListener("change", onChange);
  return () => media?.removeEventListener("change", onChange);
}
/** Keep SSR and first hydration identical before reading the viewport. */
export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );
}
