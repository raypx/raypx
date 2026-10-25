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
    const bridge = await getBridge(),
      id = crypto.randomUUID();
    const body = request.body === null ? undefined : await request.text();
    request.signal.throwIfAborted();
    const pending = bridge.request.apiFetch({
      id,
      path: url.pathname + url.search,
      method: request.method,
      headers,
      ...(body === undefined ? {} : { body }),
    });
    let abort!: () => void;
    const cancelled = new Promise<never>((_resolve, reject) => {
      abort = () => {
        void bridge.request.apiCancel({ id }).catch(() => {});
        reject(request.signal.reason ?? new DOMException("Aborted", "AbortError"));
      };
      request.signal.addEventListener("abort", abort, { once: true });
      if (request.signal.aborted) abort();
    });
    let result: Awaited<typeof pending>;
    try {
      result = await Promise.race([pending, cancelled]);
    } finally {
      request.signal.removeEventListener("abort", abort);
    }
    request.signal.throwIfAborted();
    return new Response([204, 205, 304].includes(result.status) ? null : result.body, {
      status: result.status,
      headers: result.headers,
    });
  };
}
