import { expect, it } from "vite-plus/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { acquireDesktopInstance } from "../../native/instance";
import { externalUrl } from "../../native/external";

it("keeps exactly one owner per data directory and releases on quit", () => {
  const directory = mkdtempSync(join(tmpdir(), "raypx-instance-"));
  try {
    const release = acquireDesktopInstance(directory);
    expect(release).toBeTypeOf("function");
    expect(acquireDesktopInstance(directory)).toBeNull();
    release!();
    const next = acquireDesktopInstance(directory);
    expect(next).toBeTypeOf("function");
    next!();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
it("only opens credential-free web links", () => {
  expect(externalUrl("https://example.test/path")).toBe("https://example.test/path");
  for (const value of [
    "javascript:alert(1)",
    "file:///etc/passwd",
    "https://user:key@example.test",
    "https://example.test/\n",
  ])
    expect(externalUrl(value)).toBeNull();
});
