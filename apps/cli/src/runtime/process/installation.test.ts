import { mkdtemp, mkdir, writeFile, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it, vi } from "vite-plus/test";
import { sealCliPayload } from "@raypx/tooling/build/cli";
import { installRuntimeCopy, verifyInstallation } from "./installation";
vi.mock("../daemon/build.ts", () => ({
  cliBuild: { version: "1.0.0", builtAt: 42 },
  cliExternalBun: false,
}));
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
      ["bun" + (process.platform === "win32" ? ".exe" : "")]: "external runtime fixture",
      "cli.js": "ESM fixture",
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
    expect(await readFile(join(installed, "cli.js"), "utf8")).toBe("ESM fixture");
    await writeFile(join(installed, "cli.js"), "modified JavaScript");
    expect(() => verifyInstallation(installed)).toThrow("CLI resources changed");
    await writeFile(join(installed, "cli.js"), "ESM fixture");
    await writeFile(join(installed, "herdr/herdr"), "externally changed");
    expect(() => verifyInstallation(installed)).toThrow("CLI resources changed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("locates external Bun separately from both packaged and stable Raypx launchers", async () => {
  const { resolveInstallation } = await import("./installation");
  const { createHash } = await import("node:crypto");
  const root = await mkdtemp(join(tmpdir(), "raypx 中文 # split-"));
  const suffix = process.platform === "win32" ? ".exe" : "";
  const build = { version: "1.0.0", builtAt: 42 };
  try {
    const payload = join(root, "versions/1.0.0-42");
    await mkdir(payload, { recursive: true });
    const bun = join(payload, "bun" + suffix);
    const launcher = join(payload, "raypx" + suffix);
    const stable = join(root, "raypx" + suffix);
    await writeFile(bun, "Bun fixture");
    await writeFile(launcher, "native launcher");
    await writeFile(stable, "native launcher");
    await writeFile(join(payload, "cli.js"), "ESM fixture");
    await writeFile(join(payload, "runtime.json"), "{}");
    expect(resolveInstallation(bun, build, launcher)).toEqual({
      root: payload,
      bundled: true,
      launcher,
      bunExecutable: bun,
    });
    const ownership = {
      ...build,
      directory: "versions/1.0.0-42",
      digest: createHash("sha256").update("native launcher").digest("hex"),
    };
    await writeFile(join(root, "installation.json"), JSON.stringify(ownership));
    expect(resolveInstallation(bun, build, stable)).toMatchObject({
      root: payload,
      launcher: stable,
      bunExecutable: bun,
    });
    for (const change of [
      { directory: "../outside" },
      { builtAt: 43 },
      { digest: "0".repeat(64) },
      { directory: "versions/another" },
    ]) {
      await writeFile(join(root, "installation.json"), JSON.stringify({ ...ownership, ...change }));
      expect(() => resolveInstallation(bun, build, stable)).toThrow(
        "Invalid connector installation",
      );
    }
    await rm(join(payload, "cli.js"));
    expect(() => resolveInstallation(bun, build, launcher)).toThrow(
      "Invalid external Bun installation",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
