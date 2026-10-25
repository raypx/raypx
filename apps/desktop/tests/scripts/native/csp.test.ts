import { expect, it } from "vite-plus/test";
import { createHash } from "node:crypto";
import { secureHtml } from "../../../scripts/native/csp";

it("allows only the exact prerendered scripts and the native socket transport", () => {
  const script = "window.theme='dark'",
    html = secureHtml(
      `<html><head><script>${script}</script></head><body><script src="/assets/main.js"></script></body></html>`,
    );
  expect(html).toContain(`'sha256-${createHash("sha256").update(script).digest("base64")}'`);
  expect(html).toContain("ws://127.0.0.1:*");
  expect(html).not.toContain("unsafe-eval");
  expect(html).not.toMatch(/script-src[^;]*unsafe-inline/);
  expect(secureHtml(html)).toBe(html);
});
