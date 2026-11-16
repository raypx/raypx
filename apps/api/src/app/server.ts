import { defineMiddleware } from "nitro";
import { getWebSocketHooks, setWebSocketHooks } from "crossws";
import { CLIENT_IP_HEADER } from "../runtime/server.js";
import { getBackendRuntime } from "../runtime/backend.js";

// Keep the terminal middleware's two-argument signature: H3 otherwise treats
// an API 404 Response as fallthrough and replaces its body and security headers.
export default defineMiddleware(async (event, _next) => {
  const request = event.req as Request & { ip?: string };
  const upgrade = request.headers.get("upgrade")?.toLowerCase() === "websocket";
  if (upgrade && !["/events", "/device/connect"].includes(new URL(request.url).pathname)) {
    const response = new Response(null, { status: 404, headers: { "x-raypx-service": "api" } });
    setWebSocketHooks(request, { upgrade: () => response });
    return response;
  }
  // Replace any client-supplied value with the socket address resolved by the server.
  const headers = new Headers(request.headers);
  const runtime = await getBackendRuntime();
  headers.delete(CLIENT_IP_HEADER);
  const ip = runtime.clientIp(request.ip, request.headers);
  if (ip) headers.set(CLIENT_IP_HEADER, ip);
  // Build from public fields so the forwarded request carries only the rewritten headers.
  const forwarded = new Request(request.url, {
    method: request.method,
    headers,
    body: request.body,
    signal: request.signal,
    duplex: "half",
  });
  const response = await runtime.app.fetch(forwarded);
  if (upgrade) {
    // Hand the Hono route's decision back to Nitro on the original request.
    const hooks = getWebSocketHooks(forwarded);
    setWebSocketHooks(request, {
      ...hooks,
      // Rejection hooks were captured before Hono's response middleware. Return
      // the completed response so upgrade errors retain security and identity.
      upgrade: () => (response.status === 426 && hooks ? { headers: response.headers } : response),
    });
  }
  return response;
});
