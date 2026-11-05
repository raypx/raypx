import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { afterEach, it, expect, vi } from "vite-plus/test";
import { runProcessSync } from "@raypx/runtime-node/process";
import { extractArchive } from "./archive.ts";

const roots: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("extracts compressed package resources and ignores Windows PATH tar shims", async () => {
  const root = mkdtempSync(join(tmpdir(), "raypx archive 中文 "));
  roots.push(root);
  const source = join(root, "package");
  const destination = join(root, "extracted");
  mkdirSync(source);
  mkdirSync(destination);
  writeFileSync(join(source, "LICENSE"), "synthetic package license\n");
  const archive = join(root, "package.tgz");
  const tar =
    process.platform === "win32"
      ? join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe")
      : "tar";
  expect(runProcessSync([tar, "-czf", archive, "-C", root, "package"]).exitCode).toBe(0);
  if (process.platform === "win32") {
    writeFileSync(join(root, "tar.cmd"), "@exit /b 88\r\n");
    vi.stubEnv("PATH", `${root}${delimiter}${process.env.PATH ?? ""}`);
  }
  await extractArchive(archive, destination, 1);
  expect(readFileSync(join(destination, "LICENSE"), "utf8")).toBe("synthetic package license\n");
});
