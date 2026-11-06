import { mkdtemp, mkdir, readFile, rm, writeFile, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { afterEach, expect, it } from "vite-plus/test";
import { stageRuntime } from "../../../scripts/host/prepare-cli.ts";
import { assertNativeTarget } from "../../../scripts/host/tauri.ts";
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "raypx-tauri-stage-"));
  roots.push(root);
  const source = join(root, "source"),
    target = join(root, "target");
  await mkdir(join(source, "runtime"), { recursive: true });
  await mkdir(target);
  const files: Record<string, string> = {};
  for (const name of ["raypx", "main.mjs", "runtime/node"]) {
    const data = "fixture " + name;
    await writeFile(join(source, name), data);
    files[name] = createHash("sha256").update(data).digest("hex");
  }
  await writeFile(
    join(source, "runtime.json"),
    JSON.stringify({ version: "0.1.0", builtAt: 42, files }),
  );
  return { source, target };
}
it("stages Node and JS chunks as one payload and removes stale files", async () => {
  const { source, target } = await fixture();
  await writeFile(join(target, "stale.mjs"), "old");
  await mkdir(join(target, "runtime/pnpm"), { recursive: true });
  await writeFile(join(target, "runtime/pnpm/pnpm"), "old package manager");
  await stageRuntime(source, target);
  expect(await readFile(join(target, "runtime/node"), "utf8")).toBe("fixture runtime/node");
  await expect(readFile(join(target, "stale.mjs"))).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(join(target, "runtime/pnpm/pnpm"))).rejects.toMatchObject({
    code: "ENOENT",
  });
});
it("rejects modified payloads before replacing existing inputs", async () => {
  const { source, target } = await fixture();
  await writeFile(join(target, "keep"), "old");
  await writeFile(join(source, "main.mjs"), "changed");
  await expect(stageRuntime(source, target)).rejects.toThrow("checksum");
  expect(await readFile(join(target, "keep"), "utf8")).toBe("old");
});
it.skipIf(process.platform === "win32")("rejects symlinked resources", async () => {
  const { source, target } = await fixture();
  await symlink(join(source, "main.mjs"), join(source, "extra"));
  await expect(stageRuntime(source, target)).rejects.toThrow("symlink");
});
it("rejects a cross target that would ship the wrong Node runtime", () => {
  const options = { platform: "darwin", arch: "arm64", env: {} } as const;
  expect(assertNativeTarget(["--target", "aarch64-apple-darwin"], options)).toBe(
    "aarch64-apple-darwin",
  );
  expect(() => assertNativeTarget(["--target=x86_64-apple-darwin"], options)).toThrow(
    "matching complete CLI",
  );
  expect(() =>
    assertNativeTarget([], { ...options, env: { CARGO_BUILD_TARGET: "x86_64-pc-windows-msvc" } }),
  ).toThrow("matching complete CLI");
});
