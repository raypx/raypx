import { chmod, mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { removeTemporaryDirectory } from "./temporary.js";

it("removes cyclic and dangling fixture links while preserving external targets", async () => {
  const root = await mkdtemp(join(tmpdir(), "raypx 中文 # cleanup "));
  const fixture = join(root, "fixture"),
    external = join(root, "external");
  try {
    await mkdir(fixture);
    await mkdir(external);
    await writeFile(join(external, "sentinel"), "preserved");
    await writeFile(join(fixture, "read-only-resource"), "owned");
    await chmod(join(fixture, "read-only-resource"), 0o400);
    const type = process.platform === "win32" ? "junction" : "dir";
    await symlink(external, join(fixture, "external-runtime"), type);
    await symlink(fixture, join(fixture, "cycle"), type);
    await symlink(join(root, "missing"), join(fixture, "old-runtime"), type);
    await removeTemporaryDirectory(fixture);
    await expect(stat(fixture)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(external, "sentinel"), "utf8")).toBe("preserved");
    await removeTemporaryDirectory(fixture);
  } finally {
    await removeTemporaryDirectory(fixture);
    await rm(root, { recursive: true, force: true });
  }
});
