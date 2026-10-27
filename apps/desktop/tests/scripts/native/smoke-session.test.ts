import { afterEach, expect, it } from "vite-plus/test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { prepareSmokeDirectory } from "../../native/smoke/session";

const roots: string[] = [];
async function directory() {
  const value = await mkdtemp(join(tmpdir(), "raypx-smoke-session-"));
  roots.push(value);
  return value;
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

it("marks fresh smoke data and preserves it across phases while invalidating stale cleanup receipts", async () => {
  const root = await directory();
  await prepareSmokeDirectory(root);
  await writeFile(join(root, "preferences.json"), "preserve");
  await writeFile(join(root, ".native-smoke-sessions-cleaned"), "true");
  await prepareSmokeDirectory(root);
  expect(await readFile(join(root, ".native-smoke-session-owner"), "utf8")).toBe(
    "raypx-native-smoke-v1\n",
  );
  expect(await readFile(join(root, "preferences.json"), "utf8")).toBe("preserve");
  expect(existsSync(join(root, ".native-smoke-sessions-cleaned"))).toBe(false);
});

it.each(["servers", "profiles"])(
  "refuses to mark an unowned %s directory for cleanup",
  async (name) => {
    const root = await directory();
    await mkdir(join(root, name));
    await expect(prepareSmokeDirectory(root)).rejects.toThrow(
      "empty isolated native smoke data directory",
    );
    expect(existsSync(join(root, ".native-smoke-session-owner"))).toBe(false);
    expect(existsSync(join(root, name))).toBe(true);
  },
);
