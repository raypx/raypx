import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { resolveWebOrigins } from "./public-address.js";

// The SSR bootstrap precedes all client modules. This snapshot never reads the DOM
// during render, and no request-specific state is retained by the server module.
const browserOrigins =
  typeof window === "undefined"
    ? undefined
    : {
        ...resolveWebOrigins(
          window.location.origin,
          Reflect.get(window, "__RAYPX_PUBLIC_CONFIG__") ?? {},
        ),
      };

export const webOrigins = createIsomorphicFn()
  .server(() => resolveWebOrigins(getRequestUrl().origin, process.env))
  .client(() => browserOrigins!);

export function apiOrigin() {
  return webOrigins().apiOrigin;
}
export function webOrigin() {
  return webOrigins().webOrigin;
}

/** Shared-origin browser requests stay relative; SSR resolves against this request. */
export function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = new URL(
    input instanceof Request ? input.url : String(input),
    "http://relative.invalid",
  );
  const origins = webOrigins();
  const base = typeof window === "undefined" ? origins.apiOrigin : origins.apiBaseUrl;
  const resolved = `${base}${url.pathname}${url.search}`;
  if (input instanceof Request) return globalThis.fetch(new Request(resolved, input), init);
  return globalThis.fetch(resolved, init);
}
