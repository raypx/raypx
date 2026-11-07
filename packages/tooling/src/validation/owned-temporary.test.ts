import { expect, it } from "vite-plus/test";
import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { removeOwnedTemporaryDirectory } from "./owned-temporary.js";

it("removes readonly runtime resources and junctions while preserving their targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "raypx-owned-cleanup-"));
  const fixture = join(root, "owned");
  const external = join(root, "preserved");
  try {
    await mkdir(fixture);
    await mkdir(external);
    await writeFile(join(external, "keep.txt"), "preserved");
    await writeFile(join(fixture, "readonly.txt"), "resource");
    await chmod(join(fixture, "readonly.txt"), 0o444);
    await symlink(
      external,
      join(fixture, "runtime-link"),
      process.platform === "win32" ? "junction" : "dir",
    );
    await removeOwnedTemporaryDirectory(fixture);
    await expect(stat(fixture)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(external, "keep.txt"), "utf8")).toBe("preserved");
    await removeOwnedTemporaryDirectory(fixture);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
