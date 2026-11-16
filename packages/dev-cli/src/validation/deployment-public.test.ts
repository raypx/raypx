import { expect, it } from "vitest";
import { smokePublicDeployment } from "./deployment-smoke.js";

async function fixture(
  failure?: "ingress" | "origin" | "sse-origin" | "embedding" | "cookie" | "revision",
) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      const origin = new URL(request.url).origin;
      if (path === "/")
        return new Response(
          `<script>window.__RAYPX_PUBLIC_CONFIG__={"API_PUBLIC_URL":""}</script>`,
          {
            headers: {
              "x-raypx-service": "web",
              "x-raypx-revision": "abc",
              "x-raypx-gateway-revision": failure === "revision" ? "old" : "abc",
            },
          },
        );
      if (failure === "ingress" && path.startsWith("/api/"))
        return new Response("Web fallback", { headers: { "x-raypx-service": "web" } });
      const headers = {
        "x-raypx-service": "api",
        "x-raypx-revision": "abc",
        "content-security-policy": `frame-ancestors ${failure === "embedding" ? "'none'" : origin}`,
      };
      if (path === "/api/events")
        return new Response(null, {
          status:
            failure === "origin" ||
            (failure === "sse-origin" && request.headers.get("accept") === "text/event-stream") ||
            request.headers.get("origin")?.includes("foreign")
              ? 403
              : 401,
          headers,
        });
      if (path === "/api/device/connect")
        return new Response(null, {
          status: failure === "cookie" && request.headers.has("cookie") ? 403 : 401,
          headers,
        });
      return new Response(null, {
        status: ["/health", "/ready"].includes(path) ? 200 : 404,
        headers,
      });
    },
  });
  return { server, origin: `http://127.0.0.1:${server.port}` };
}
it("checks every ingress, unauthenticated upgrades, public Page CSP and connector cookies", async () => {
  const f = await fixture();
  const lines: string[] = [];
  try {
    await smokePublicDeployment(f.origin, undefined, (line) => lines.push(line));
    expect(lines).toContain("PASS api-ingress:/api/");
    expect(lines).toContain("PASS events-public-origin");
    expect(lines).toContain("PASS page-embedding");
    expect(lines).toContain("PASS device-cookie-stripping");
    expect(lines).toContain("PASS events-sse-public-origin");
    expect(lines).toContain("PASS events-sse-foreign-origin");
    expect(lines.filter((line) => line.startsWith("PASS"))).toHaveLength(14);
  } finally {
    await f.server.stop(true);
  }
});
it.each([
  ["ingress", "api-ingress:/api/"],
  ["origin", "events-public-origin"],
  ["sse-origin", "events-sse-public-origin"],
  ["embedding", "page-embedding"],
  ["cookie", "device-cookie-stripping"],
  ["revision", "service-revisions"],
] as const)("names the %s field failure", async (failure, check) => {
  const f = await fixture(failure);
  const lines: string[] = [];
  try {
    await expect(
      smokePublicDeployment(f.origin, undefined, (line) => lines.push(line)),
    ).rejects.toThrow("Deployment smoke failed");
    expect(lines.some((line) => line.startsWith(`FAIL ${check}:`))).toBe(true);
    expect(lines.every((line) => !line.includes("\n"))).toBe(true);
  } finally {
    await f.server.stop(true);
  }
});
