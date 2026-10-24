import { CONNECTION_KEY, DEFAULT_CONNECTION, parseConnection } from "../../config";
import { isDesktop } from "./desktop";

export function readDesktopConnection() {
  if (isDesktop()) return parseConnection(Reflect.get(window, CONNECTION_KEY));
  // An ordinary browser preview cannot read user files. Native always uses its preload.
  const apiUrl = import.meta.env.VITE_API_URL || DEFAULT_CONNECTION.apiUrl;
  return parseConnection({ apiUrl, webUrl: import.meta.env.VITE_WEB_URL || apiUrl });
}
