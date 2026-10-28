import { mkdtempSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import { stageCli } from "../../../scripts/native/prepare-cli";

const roots: string[] = [];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "raypx-sidecar-"));
  roots.push(root);
  const source = join(root, "cli");
  const target = join(root, "binaries", "raypx-target");
  writeFileSync(source, "current CLI");
  return { source, target };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

it("stages a missing CLI sidecar", async () => {
  const { source, target } = fixture();
  expect(await stageCli(source, target)).toBe(true);
  expect(await Bun.file(target).text()).toBe("current CLI");
});

it.skipIf(process.platform === "win32")("makes the staged sidecar executable", async () => {
  const { source, target } = fixture();
  await stageCli(source, target);
  expect(statSync(target).mode & 0o777).toBe(0o755);
});

it("preserves an identical sidecar's mtime so packaging can reuse Cargo outputs", async () => {
  const { source, target } = fixture();
  await stageCli(source, target);
  const previous = new Date("2020-01-01T00:00:00Z");
  utimesSync(target, previous, previous);
  const before = statSync(target).mtimeMs;
  expect(await stageCli(source, target)).toBe(false);
  expect(statSync(target).mtimeMs).toBe(before);
});

it("replaces stale bytes even when size and modification time match", async () => {
  const { source, target } = fixture();
  await stageCli(source, target);
  writeFileSync(target, "outdatedCLI");
  const sameTime = new Date("2020-01-01T00:00:00Z");
  utimesSync(source, sameTime, sameTime);
  utimesSync(target, sameTime, sameTime);
  expect(statSync(source).size).toBe(statSync(target).size);
  expect(await stageCli(source, target)).toBe(true);
  expect(await Bun.file(target).text()).toBe("current CLI");
});
