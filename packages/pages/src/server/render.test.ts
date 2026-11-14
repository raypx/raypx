import { createHash } from "node:crypto";
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
it("inlines a neutral light/dark document stylesheet authorized only by its exact CSP hash", () => {
  const html = renderPage(fixture("# Report\n\nText\n\n| A | B |\n| - | - |\n| 1 | 2 |"));
  const styles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)];
  expect(styles).toHaveLength(1);
  const css = styles[0]![1]!;
  const hash = createHash("sha256").update(css).digest("base64");
  const csp = pageResponseHeaders(["https://app.example"], "document").get(
    "content-security-policy",
  )!;
  expect(csp.split("; ")).toContain(`style-src 'sha256-${hash}'`);
  expect(csp).toContain("script-src 'none'");
  expect(csp).toContain("sandbox;");
  expect(csp).not.toMatch(/unsafe-inline|allow-scripts|allow-same-origin/);
  expect(css).toContain("prefers-color-scheme: dark");
  expect(css).toContain("max-width: 48rem");
  expect(css).toContain("img { display: block; max-width: 100%; height: auto;");
  expect(css).not.toMatch(/@import|url\s*\(/i);
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
  expect(csp).toContain("script-src 'unsafe-inline'; style-src 'unsafe-inline'");
  expect(csp).not.toContain("sha256-");
});

it("renders self-contained raster images without allowing data links, SVG or remote images", () => {
  const raster =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=";
  const html = renderPage(
    fixture(
      `![Preview](${raster})\n\n![Remote](https://example.test/image.png)\n\n![Active](data:image/svg+xml;base64,PHN2Zy8+)\n\n[Unsafe](data:text/html;base64,PHNjcmlwdD4=)`,
    ),
  );
  expect(html).toContain(`src="${raster}"`);
  expect(html).not.toContain('src="https://example.test');
  expect(html).not.toMatch(/data:image\/svg|href="data:/);
});
