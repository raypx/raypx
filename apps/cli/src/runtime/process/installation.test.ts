import { mkdtemp, mkdir, writeFile, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { sealCliPayload } from "@raypx/tooling/build/cli";
import { installRuntimeCopy, verifyInstallation } from "./installation.js";
vi.mock("../daemon/build.js", () => ({ cliBuild: { version: "1.0.0", builtAt: 42 } }));
it("retains the complete verified runtime after its source is moved and refuses changed resources", async () => {
  const root = await mkdtemp(join(tmpdir(), "raypx 中文 # runtime-"));
  try {
    const source = join(root, "source");
    await mkdir(join(source, "herdr"), { recursive: true });
    const executable = process.platform === "win32" ? "raypx.exe" : "raypx";
    for (const [name, data] of Object.entries({
      [executable]: "compiled fixture",
      "herdr/runtime.json": "{}",
      "herdr/herdr": "PTY fixture",
      LICENSE: "license",
      "README.txt": "usage",
    }))
      await writeFile(join(source, name), data);
    await sealCliPayload(source, {
      format: 1,
      commit: "a".repeat(40),
      platform: process.platform,
      arch: process.arch,
      version: "1.0.0",
      builtAt: 42,
      bunVersion: Bun.version,
      herdrVersion: "fixture",
    });
    const installed = installRuntimeCopy(source, join(root, "versions"));
    await rename(source, join(root, "moved"));
    expect(await readFile(join(installed, "herdr/herdr"), "utf8")).toBe("PTY fixture");
    expect(verifyInstallation(installed).builtAt).toBe(42);
    await writeFile(join(installed, "herdr/herdr"), "externally changed");
    expect(() => verifyInstallation(installed)).toThrow("CLI resources changed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
