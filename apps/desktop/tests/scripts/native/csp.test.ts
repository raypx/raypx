import { expect, it } from "vite-plus/test";
import { createHash } from "node:crypto";
import { secureHtml } from "../../../scripts/native/csp";

it("allows only the exact prerendered scripts and the Tauri IPC transport", () => {
  const script = "window.theme='dark'",
    html = secureHtml(
      `<html><head><script>${script}</script></head><body><script src="/assets/main.js"></script></body></html>`,
    );
  expect(html).toContain(`'sha256-${createHash("sha256").update(script).digest("base64")}'`);
  expect(html).toContain("ipc: http://ipc.localhost");
  expect(html).not.toContain("views:");
  expect(html).not.toContain("ws://");
  expect(html).not.toContain("unsafe-eval");
  expect(html).not.toMatch(/script-src[^;]*unsafe-inline/);
  expect(secureHtml(html)).toBe(html);
});

it("keeps packaged policy independent of browser preview connection settings", () => {
  const source = "<html><head><script>window.ready=true</script></head><body></body></html>";
  expect(secureHtml(source, { apiOrigin: "http://127.0.0.1:45991" })).toBe(secureHtml(source));
  expect(secureHtml(source, { browserPreview: false, apiOrigin: "http://127.0.0.1:45991" })).toBe(
    secureHtml(source),
  );
});

it("allows only the exact validated loopback API origin in browser acceptance output", () => {
  const source = "<html><head><script>window.ready=true</script></head><body></body></html>";
  const html = secureHtml(source, { browserPreview: true, apiOrigin: "http://127.0.0.1:45991" });
  expect(html).toContain("https: http://127.0.0.1:45991;");
  expect(html).not.toContain("http://127.0.0.1:*");
  expect(html).not.toMatch(/script-src[^;]*unsafe-inline/);
  expect(() =>
    secureHtml(source, { browserPreview: true, apiOrigin: "http://api.example.test" }),
  ).toThrow(/Server URL/);
  expect(() =>
    secureHtml(source, { browserPreview: true, apiOrigin: "http://127.0.0.1:45991/path" }),
  ).toThrow(/Server URL/);
});
