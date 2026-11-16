import { CONNECTION_KEY, parseConnection } from "../../config.js";
import { isDesktop } from "./desktop.js";

export function readDesktopConnection() {
  if (isDesktop()) return parseConnection(Reflect.get(window, CONNECTION_KEY));
  // An ordinary browser preview cannot read user files. Native always uses its preload.
  const apiUrl = import.meta.env.VITE_DESKTOP_PREVIEW_API_URL || "http://127.0.0.1:3002";
  return parseConnection({ apiUrl, webUrl: import.meta.env.VITE_WEB_URL || apiUrl });
}
