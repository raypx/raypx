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
    await mkdir(source);
    const executable = process.platform === "win32" ? "raypx.exe" : "raypx";
    for (const [name, data] of Object.entries({
      [executable]: "compiled fixture",
      LICENSE: "license",
      "README.txt": "usage",
    }))
      await writeFile(join(source, name), data);
    await sealCliPayload(source, {
      format: 2,
      commit: "a".repeat(40),
      platform: process.platform,
      arch: process.arch,
      version: "1.0.0",
      builtAt: 42,
      bunVersion: Bun.version,
    });
    const installed = installRuntimeCopy(source, join(root, "versions"));
    await rename(source, join(root, "moved"));
    expect(await readFile(join(installed, executable), "utf8")).toBe("compiled fixture");
    expect(verifyInstallation(installed).builtAt).toBe(42);
    await writeFile(join(installed, executable), "externally changed");
    expect(() => verifyInstallation(installed)).toThrow("CLI resources changed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
