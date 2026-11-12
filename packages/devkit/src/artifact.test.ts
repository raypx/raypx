import { copyFile, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { probeArtifact, stageArtifact } from "./artifact.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});
it("copies a self-contained output and rejects links into a checkout or package cache", async () => {
  const root = await mkdtemp(join(tmpdir(), "devkit-artifact-test-"));
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

it("starts a relocated server output, waits for health and runs the check", async () => {
  const root = await mkdtemp(join(tmpdir(), "devkit-probe-test-"));
  roots.push(root);
  await mkdir(join(root, "output/server"), { recursive: true });
  await copyFile(
    new URL("../tests/fixtures/artifact/server.mjs", import.meta.url),
    join(root, "output/server/index.mjs"),
  );
  const seen: string[] = [];
  await probeArtifact({
    name: "fixture",
    output: join(root, "output"),
    node: process.execPath,
    environment: () => ({ GREETING: "hello" }),
    check: async (base) => {
      seen.push(await (await fetch(`${base}/health`)).text());
    },
  });
  expect(seen).toEqual(["hello"]);
});

it("reports a server that exits during startup", async () => {
  const root = await mkdtemp(join(tmpdir(), "devkit-probe-test-"));
  roots.push(root);
  await mkdir(join(root, "output/server"), { recursive: true });
  await writeFile(join(root, "output/server/index.mjs"), 'console.error("boom"); process.exit(1);');
  await expect(
    probeArtifact({
      name: "broken",
      output: join(root, "output"),
      node: process.execPath,
      check: async () => {},
    }),
  ).rejects.toThrow("broken exited during startup");
});
