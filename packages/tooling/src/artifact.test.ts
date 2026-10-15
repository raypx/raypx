import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { stageArtifact } from "./artifact.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
it("copies a self-contained output and rejects links into a checkout or package cache", async () => {
  const root = await mkdtemp(join(tmpdir(), "raypx-artifact-test-"));
  roots.push(root);
  const output = join(root, "output");
  await mkdir(output);
  await writeFile(join(output, "index.mjs"), "export const ready = true;");
  await stageArtifact(output, join(root, "relocated"));
  expect(await readFile(join(root, "relocated/index.mjs"), "utf8")).toContain("ready");
  const external = join(root, "checkout");
  await mkdir(external);
  await symlink(
    external,
    join(output, "hidden-dependency"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await expect(stageArtifact(output, join(root, "invalid"))).rejects.toThrow("escapes its output");
});
