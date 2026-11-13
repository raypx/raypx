import { expect, it } from "vitest";
import { pageVersionSchema } from "@raypx/core/pages";
import { pageResponseHeaders, renderPage } from "./render.js";

function fixture(body: string, kind: "html" | "document" = "document") {
  return pageVersionSchema.parse({
    id: "page",
    spaceId: "space",
    agentId: null,
    title: "A <report>",
    kind,
    version: 1,
    body,
    author: { kind: "member", accountId: "member", runId: null },
    reason: "created",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  });
}
it("renders Markdown with raw HTML disabled, safe protocols and no executable elements or attributes", () => {
  const html = renderPage(
    fixture(
      '# Report\n\n<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[bad](javascript:alert%281%29)\n\n<iframe src="https://app.example/api"></iframe>\n\n**Safe** [reference](https://example.test)',
    ),
  );
  expect(html).toContain("<h1>Report</h1>");
  expect(html).toContain("<strong>Safe</strong>");
  expect(html).toContain('href="https://example.test"');
  expect(html).not.toMatch(/<script|<iframe|onerror=|javascript:/i);
  expect(html).toContain("A &lt;report&gt;");
});
it("serves the self-contained HTML bytes under an opaque sandbox and denies credentials, forms and external connections", () => {
  const body =
    '<!doctype html><script>fetch("/api", {credentials:"include"})</script><style>p{color:red}</style><p>Report</p>';
  expect(renderPage(fixture(body, "html"))).toBe(body);
  const headers = pageResponseHeaders(["https://app.example"]);
  const csp = headers.get("content-security-policy")!;
  expect(csp).toContain("sandbox allow-scripts");
  expect(csp).not.toContain("allow-same-origin");
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("connect-src 'none'");
  expect(csp).toContain("form-action 'none'");
  expect(csp).toContain("frame-ancestors https://app.example");
  expect(headers.get("x-content-type-options")).toBe("nosniff");
  expect(headers.get("referrer-policy")).toBe("no-referrer");
  expect(headers.get("cache-control")).toBe("no-store");
  expect(headers.has("set-cookie")).toBe(false);
});
