import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import { pageVersionSchema } from "@raypx/core/pages";
import type { PagesService } from "@raypx/pages/server";
import { resolveSpaceScope, type SpaceAccess } from "@raypx/spaces/server";
import { spaceIdSchema } from "@raypx/core/spaces";
import { createApiApp } from "../../tests/helpers/app.js";

const token = "a".repeat(64);
const at = "2026-01-01T00:00:00.000Z";
function fixture(kind: "html" | "document" = "document") {
  let revoked = false;
  const page = pageVersionSchema.parse({
    id: "page",
    spaceId: "space",
    agentId: null,
    title: "Report",
    kind,
    version: 1,
    body:
      kind === "html"
        ? '<script>fetch("/api",{credentials:"include"})</script><p>Report</p>'
        : '# Report\n\n<script>evil()</script>\n\n<img src=x onerror="evil()">\n\n[bad](javascript:evil%28%29)\n\n<iframe src="/api"></iframe>',
    author: { kind: "member", accountId: "member", runId: null },
    reason: "created",
    createdAt: at,
    updatedAt: at,
  });
  const get = vi.fn(async () => page);
  const pages = {
    resolveShare: vi.fn(async (supplied: string) => (supplied === token && !revoked ? page : null)),
    get,
  } as unknown as PagesService;
  const readSession = vi.fn(async () => null);
  const app = createApiApp({ pages, allowedOrigins: ["https://app.example"], readSession });
  return {
    app,
    pages,
    get,
    readSession,
    revoke: () => {
      revoked = true;
    },
  };
}
function safeHeaders(response: Response, kind: "html" | "document" = "document") {
  const csp = response.headers.get("content-security-policy")!;
  expect(csp).toContain(kind === "html" ? "sandbox allow-scripts" : "sandbox;");
  expect(csp.includes("script-src 'none'")).toBe(kind === "document");
  expect(csp.includes("unsafe-inline")).toBe(kind === "html");
  expect(csp).not.toContain("allow-same-origin");
  expect(csp).toContain("form-action 'none'");
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("frame-ancestors https://app.example");
  expect(response.headers.get("x-frame-options")).toBeNull();
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.has("set-cookie")).toBe(false);
}
it("keeps sandbox headers through the complete API middleware and never resolves or sets a public session", async () => {
  for (const kind of ["document", "html"] as const) {
    const f = fixture(kind);
    const response = await f.app.request(`/page-content/public/${token}`, {
      headers: { cookie: "session=private" },
    });
    expect(response.status).toBe(200);
    safeHeaders(response, kind);
    expect(f.readSession).not.toHaveBeenCalled();
    const body = await response.text();
    const containsExecutableMarkup = /<script|<iframe|onerror=|javascript:/i.test(body);
    expect(containsExecutableMarkup).toBe(kind === "html");
    expect(body.includes("<style>")).toBe(kind === "document");
  }
});
it("returns the identical not-found response for invalid, expired, revoked or unknown tokens and revokes on the next request", async () => {
  const f = fixture();
  const path = `/page-content/public/${token}`;
  expect((await f.app.request(path)).status).toBe(200);
  f.revoke();
  const results = await Promise.all(
    [path, "/page-content/public/invalid", `/page-content/public/${"b".repeat(64)}`].map(
      async (value) => f.app.request(value),
    ),
  );
  const bodies = [];
  for (const response of results) {
    expect(response.status).toBe(404);
    safeHeaders(response);
    bodies.push(await response.text());
  }
  expect(new Set(bodies).size).toBe(1);
});
it("rate-limits a token and a platform-owned address independently", async () => {
  const f = fixture();
  const path = `/page-content/public/${token}`;
  for (let i = 0; i < 60; i++) expect((await f.app.request(path)).status).toBe(200);
  const tokenLimit = await f.app.request(path);
  expect(tokenLimit.status).toBe(429);
  expect(tokenLimit.headers.get("retry-after")).toBe("60");
  safeHeaders(tokenLimit);
  const fresh = fixture();
  for (let i = 0; i < 120; i++)
    await fresh.app.request(`/page-content/public/${i.toString(16).padStart(64, "0")}`, {
      headers: { "x-raypx-client-ip": "192.0.2.1" },
    });
  expect(
    (await fresh.app.request(path, { headers: { "x-raypx-client-ip": "192.0.2.1" } })).status,
  ).toBe(429);
  expect(
    (await fresh.app.request(path, { headers: { "x-raypx-client-ip": "192.0.2.2" } })).status,
  ).toBe(200);
});
it("resolves fresh membership for member rendering and returns the same sandboxed response without cookies", async () => {
  const f = fixture("html");
  const scope = resolveSpaceScope(
    { spaceId: spaceIdSchema.parse("space"), accountId: "member", role: "member", createdAt: at },
    "member",
    spaceIdSchema.parse("space"),
  );
  const resolve = vi.fn(async () => scope);
  const app = createApiApp({
    pages: f.pages,
    spaces: { resolve } as unknown as SpaceAccess,
    allowedOrigins: ["https://app.example"],
    readSession: async () => ({ user: { id: "member" } }) as never,
  });
  const response = await app.request("/page-content/member/space/page?version=1");
  expect(response.status).toBe(200);
  safeHeaders(response, "html");
  expect(resolve).toHaveBeenCalledExactlyOnceWith("member", "space");
  expect(f.get).toHaveBeenCalledWith(scope, "page", 1);
  expect((await f.app.request("/page-content/member/space/page")).status).toBe(404);
});

function stylesheetCoveredByPolicy(body: string, response: Response) {
  const styles = [...body.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  expect(styles).toHaveLength(1);
  const hash = createHash("sha256").update(styles[0]![1]!).digest("base64");
  expect(response.headers.get("content-security-policy")!.split("; ")).toContain(
    `style-src 'sha256-${hash}'`,
  );
}

it("serves the same hash-authorized Markdown styling for member frames and public shares", async () => {
  const f = fixture();
  const scope = resolveSpaceScope(
    { spaceId: spaceIdSchema.parse("space"), accountId: "member", role: "member", createdAt: at },
    "member",
    spaceIdSchema.parse("space"),
  );
  const app = createApiApp({
    pages: f.pages,
    spaces: { resolve: async () => scope } as unknown as SpaceAccess,
    allowedOrigins: ["https://app.example"],
    readSession: async () => ({ user: { id: "member" } }) as never,
  });
  const member = await app.request("/page-content/member/space/page");
  const publicShare = await f.app.request(`/page-content/public/${token}`);
  expect(member.status).toBe(200);
  expect(publicShare.status).toBe(200);
  safeHeaders(member);
  safeHeaders(publicShare);
  const memberBody = await member.text();
  const publicBody = await publicShare.text();
  expect(memberBody).toBe(publicBody);
  stylesheetCoveredByPolicy(memberBody, member);
  stylesheetCoveredByPolicy(publicBody, publicShare);
});
