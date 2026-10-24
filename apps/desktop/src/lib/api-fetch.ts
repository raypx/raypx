import { getBridge, isDesktop } from "./desktop";

/** Native owns cookies; renderer code receives only the ordinary API response. */
export function createDesktopFetch(baseUrl: string) {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isDesktop()) return globalThis.fetch(input, init);
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin !== new URL(baseUrl).origin) throw new Error("Invalid desktop API origin");
    request.signal.throwIfAborted();
    const headers: Record<string, string> = {};
    for (const name of ["accept", "accept-language", "content-type"]) {
      const value = request.headers.get(name);
      if (value !== null) headers[name] = value;
    }
    const result = await (
      await getBridge()
    ).request.apiFetch({
      path: url.pathname + url.search,
      method: request.method,
      headers,
      ...(request.body === null ? {} : { body: await request.text() }),
    });
    request.signal.throwIfAborted();
    return new Response([204, 205, 304].includes(result.status) ? null : result.body, {
      status: result.status,
      headers: result.headers,
    });
  };
}
