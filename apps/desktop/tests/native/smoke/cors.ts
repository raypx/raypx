import assert from "node:assert/strict";

interface CorsDriver {
  request<T>(method: string, input: unknown): Promise<T>;
}
interface CorsResult {
  sameOrigin: boolean;
  allowedCors: boolean;
  blockedCors: boolean;
  origin: string;
  cspMeta: boolean;
  error: string | null;
}

/** Positive controls distinguish actual WebView CORS rejection from CSP/network failures. */
export async function measureNativeCors(driver: CorsDriver) {
  const counts = { sameOrigin: 0, allowedCors: 0, deniedCors: 0 };
  const serverA = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/__raypx_cors/page")
        return new Response("<!doctype html><title>Raypx CORS acceptance</title>", {
          headers: { "content-type": "text/html", "cache-control": "no-store" },
        });
      if (path === "/__raypx_cors/same") {
        counts.sameOrigin++;
        return new Response("same-origin", { headers: { "cache-control": "no-store" } });
      }
      return new Response(null, { status: 404 });
    },
  });
  const originA = `http://127.0.0.1:${serverA.port}`;
  const serverB = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      if (path === "/__raypx_cors/allowed") {
        counts.allowedCors++;
        return new Response("allowed-cors", {
          headers: {
            "access-control-allow-origin": originA,
            "cache-control": "no-store",
            vary: "Origin",
          },
        });
      }
      if (path === "/__raypx_cors/denied") {
        counts.deniedCors++;
        return new Response("denied-cors", { headers: { "cache-control": "no-store" } });
      }
      return new Response(null, { status: 404 });
    },
  });
  try {
    const result = await driver.request<CorsResult>("cors", {
      originA,
      originB: `http://127.0.0.1:${serverB.port}`,
    });
    assert.equal(result.error, null, "CORS positive control failed");
    assert.equal(result.origin, originA);
    assert.equal(result.cspMeta, false, "CORS fixture unexpectedly has an application CSP");
    assert.equal(result.sameOrigin, true, "Same-origin positive control failed");
    assert.equal(result.allowedCors, true, "Allowed cross-origin positive control failed");
    assert.ok(counts.deniedCors > 0, "Denied request never reached the HTTP fixture");
    assert.equal(result.blockedCors, true, "WebView read a cross-origin response without ACAO");
    return { ...result, requestCounts: counts };
  } finally {
    await Promise.all([serverA.stop(true), serverB.stop(true)]);
  }
}
