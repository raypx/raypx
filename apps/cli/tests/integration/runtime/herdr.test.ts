import { describe, expect, it } from "vite-plus/test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProcessRuntime } from "../../../src/runtime/process";
import { HerdrTerminalHost } from "../../../src/runtime/process/herdr";
import {
  digestHerdr,
  herdrVersion,
  verifyHerdrDirectory,
} from "../../../src/runtime/process/herdr-release";

describe("Herdr admission and distribution", () => {
  it("keeps ordinary commands independent of Herdr and rejects an invalid selection", async () => {
    const runtime = new ProcessRuntime(() => {}, "relative-path");
    const command = {
      executable: process.execPath,
      args: ["-e", "console.log('ordinary')"],
      cwd: tmpdir(),
      timeoutMs: 10000,
    };
    try {
      expect((await runtime.run(command)).output).toContain("ordinary");
      await expect(runtime.terminal(command, 80, 24)).rejects.toMatchObject({
        code: "TERMINAL_HOST_UNAVAILABLE",
      });
    } finally {
      await runtime.close();
    }
  });
  it("rejects an incompatible executable before creating a session", async () => {
    const host = new HerdrTerminalHost(process.execPath, () => {});
    try {
      await expect(
        host.open(
          { executable: process.execPath, args: [], cwd: tmpdir(), timeoutMs: 1000 },
          80,
          24,
        ),
      ).rejects.toMatchObject({ code: "TERMINAL_HOST_MISMATCH" });
    } finally {
      await host.close();
    }
  });
  it("checks the executable and supporting runtime files before using a cached distribution", async () => {
    const root = await mkdtemp(join(tmpdir(), "raypx-herdr-distribution-"));
    const executable = process.platform === "win32" ? "herdr.exe" : "herdr";
    try {
      await writeFile(join(root, executable), "fixture-executable");
      await writeFile(join(root, "ConPTY.dll"), "fixture-runtime");
      const files = {
        [executable]: await digestHerdr(join(root, executable)),
        "ConPTY.dll": await digestHerdr(join(root, "ConPTY.dll")),
      };
      await writeFile(join(root, "runtime.json"), JSON.stringify({ version: herdrVersion, files }));
      expect(await verifyHerdrDirectory(root)).toBe(true);
      await writeFile(join(root, "ConPTY.dll"), "changed");
      expect(await verifyHerdrDirectory(root)).toBe(false);
      await writeFile(
        join(root, "runtime.json"),
        JSON.stringify({
          version: herdrVersion,
          files: { "../escape": "abc", [executable]: files[executable] },
        }),
      );
      expect(await verifyHerdrDirectory(root)).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
