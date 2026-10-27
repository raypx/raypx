import { CLIENT_IP_HEADER, getApiRuntime } from "../runtime/server.js";

export default {
  async fetch(request: Request & { ip?: string }): Promise<Response> {
    // Replace any client-supplied value with the socket address resolved by the server.
    const headers = new Headers(request.headers);
    const runtime = await getApiRuntime();
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
    return runtime.app.fetch(forwarded);
  },
};
