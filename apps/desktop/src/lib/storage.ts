import { CONNECTION_KEY, parseConnection } from "../../config";

/** One native WebView store, with server-scoped application keys. */
export function desktopStorageKey(key: string) {
  if (typeof window === "undefined" || !Reflect.has(window, CONNECTION_KEY)) return key;
  return JSON.stringify([
    "raypx.desktop",
    parseConnection(Reflect.get(window, CONNECTION_KEY)).apiUrl,
    key,
  ]);
}
