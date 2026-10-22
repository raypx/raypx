import { CLIENT_IP_HEADER, getApiRuntime } from "../runtime/node.js";

export default {
  async fetch(request: Request & { ip?: string }): Promise<Response> {
    // Replace any client-supplied value with the socket address resolved by the server.
    const headers = new Headers(request.headers);
    headers.delete(CLIENT_IP_HEADER);
    if (request.ip) headers.set(CLIENT_IP_HEADER, request.ip);
    // Build from public fields: Nitro's Node request is not an Undici Request.
    const forwarded = new Request(request.url, {
      method: request.method,
      headers,
      body: request.body,
      signal: request.signal,
      duplex: "half",
    });
    return (await getApiRuntime()).app.fetch(forwarded);
  },
};
