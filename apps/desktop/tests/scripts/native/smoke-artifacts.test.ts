import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { cleanupSmokeBundles } from "../../../scripts/native/smoke-artifacts";

const roots: string[] = [];
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "raypx-smoke-cleanup-"));
  roots.push(directory);
  const project = join(directory, "apps/desktop");
  mkdirSync(project, { recursive: true });
  const output = join(
    project,
    `build/native-smoke/darwin-${process.arch === "x64" ? "amd64" : process.arch}`,
  );
  const testApp = join(output, "Raypx Test.app"),
    releaseApp = join(output, "Raypx.app");
  for (const app of [testApp, releaseApp]) {
    mkdirSync(join(app, "Contents"), { recursive: true });
    writeFileSync(join(app, "Contents/Info.plist"), "fixture");
  }
  return { project, output, testApp, releaseApp };
}
afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

it("unregisters a verified test bundle before removing it and preserves release bundles", async () => {
  const f = fixture();
  const run = vi.fn(async (command: string, args: string[]) => {
    if (command === "/usr/bin/plutil")
      return args.at(-1)!.includes("Raypx Test.app")
        ? "com.raypx.desktop.native-smoke\n"
        : "com.raypx.desktop\n";
    expect(args).toEqual(["-u", f.testApp]);
    expect(existsSync(f.testApp)).toBe(true);
    return "";
  });
  await cleanupSmokeBundles(f.project, { platform: "darwin", run });
  expect(existsSync(f.testApp)).toBe(false);
  expect(existsSync(f.releaseApp)).toBe(true);
  expect(run.mock.calls.filter(([command]) => command.endsWith("/lsregister"))).toHaveLength(1);
});
it("retains the bundle when unregistering fails rather than leaving an undetectable stale registration", async () => {
  const f = fixture();
  const run = vi.fn(async (command: string) => {
    if (command === "/usr/bin/plutil") return "com.raypx.desktop.native-smoke";
    throw new Error("registry busy");
  });
  await expect(cleanupSmokeBundles(f.project, { platform: "darwin", run })).rejects.toThrow(
    "registry busy",
  );
  expect(existsSync(f.testApp)).toBe(true);
});
it("rejects a substituted output symlink without touching the target application", async () => {
  const f = fixture();
  const root = f.output;
  const outside = join(f.project, "outside");
  mkdirSync(outside);
  writeFileSync(join(outside, "keep.txt"), "preserve");
  rmSync(root, { recursive: true });
  symlinkSync(outside, root, process.platform === "win32" ? "junction" : "dir");
  const run = vi.fn(async () => "");
  await expect(cleanupSmokeBundles(f.project, { platform: "darwin", run })).rejects.toThrow(
    "Unsafe smoke output directory",
  );
  expect(existsSync(join(outside, "keep.txt"))).toBe(true);
  expect(run).not.toHaveBeenCalled();
});
