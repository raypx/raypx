import { createApiClient, type CreateApiClientOptions } from "@voidmix/client";
import { env } from "../env";
import { getDesktopLocaleHeaders } from "../i18n/client";

export function desktopApiOptions(): CreateApiClientOptions {
  return {
    ...(env.VITE_API_URL ? { baseUrl: env.VITE_API_URL } : {}),
    headers: getDesktopLocaleHeaders,
    fetch: (input, init) => globalThis.fetch(input, { ...init, credentials: "include" }),
  };
}
export function createDesktopApiClient() {
  return createApiClient(desktopApiOptions());
}
