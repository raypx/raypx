import { allowedOrigins, type RelaySecrets } from "./environment.js";

interface RelayTarget {
  fetch(request: Request): Promise<Response>;
}

export async function proxyRelay(
  request: Request,
  env: RelaySecrets,
  target: () => RelayTarget,
): Promise<Response> {
  const url = new URL(request.url);
  if (!["/relay", "/health", "/ready"].includes(url.pathname))
    return new Response("Not found", { status: 404 });
  if (request.method !== "GET")
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
  // The relay protocol authenticates in the first frame. Query strings are not
  // part of this ingress contract and must not transport tickets or credentials.
  if (url.search) return new Response("Unexpected query", { status: 400 });
  if (url.pathname === "/relay" && request.headers.get("Upgrade")?.toLowerCase() !== "websocket")
    return new Response("WebSocket upgrade required", { status: 426 });
  try {
    const origin = request.headers.get("Origin");
    if (origin !== null && !allowedOrigins(env.ALLOWED_ORIGINS).has(origin))
      return new Response("Forbidden", { status: 403 });
    const headers = new Headers(request.headers);
    for (const name of ["Cookie", "Authorization", "Proxy-Authorization", "Host"])
      headers.delete(name);
    for (const name of request.headers.keys())
      if (name.startsWith("cf-container-")) headers.delete(name);
    url.protocol = "http:";
    url.host = "container";
    // Return the actual response: rebuilding a 101 response loses its WebSocket.
    const response = await target().fetch(
      new Request(url.toString(), { method: "GET", headers, redirect: "manual" }),
    );
    if (response.status >= 500) {
      await response.body?.cancel();
      throw new Error("Relay unavailable");
    }
    return response;
  } catch {
    // No automatic replay: a failed fetch may already have reached the relay.
    return new Response("Relay unavailable", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}
