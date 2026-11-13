import type { Context } from "hono";
import type { ApiEventLogger } from "../logging.js";

export interface ApiRouterEnv {
  Variables: {
    requestId: string;
    auditActorId: string;
    requestLog?: ApiEventLogger<"http.request">;
    rpcLogged: boolean;
  };
}

export function procedureRequest(c: Context<ApiRouterEnv>, method = c.req.method) {
  const requestId = c.get("requestId");
  const headers = new Headers(c.req.raw.headers);
  // The handler and its error response use the server-owned request ID.
  headers.set("x-request-id", requestId);
  // Nitro can supply a Request-compatible wrapper. Preserve the stream and signal.
  const init = { method, headers, signal: c.req.raw.signal };
  const request =
    method === "GET" || method === "HEAD"
      ? new Request(c.req.url, init)
      : new Request(c.req.url, { ...init, body: c.req.raw.body, duplex: "half" });
  return { request, context: { headers: c.req.raw.headers, requestId } };
}
