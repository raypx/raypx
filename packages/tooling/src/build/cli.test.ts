import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { it, expect } from "vite-plus/test";
import { sealCliPayload, verifyCliPayload } from "./cli.js";
it("seals signed bytes without changing identity and rejects altered, extra or linked resources", async () => {
  const root = await mkdtemp(join(tmpdir(), "raypx-payload-"));
  try {
    await mkdir(join(root, "herdr"));
    for (const name of ["raypx", "herdr/herdr", "herdr/runtime.json", "LICENSE", "README.txt"])
      await writeFile(join(root, name), "unsigned");
    const identity = {
      format: 1 as const,
      commit: "a".repeat(40),
      platform: "darwin",
      arch: "arm64",
      version: "1.0.0",
      builtAt: 1234,
      bunVersion: "1.4.4",
      herdrVersion: "0.9.5",
    };
    await sealCliPayload(root, identity);
    expect(await verifyCliPayload(root, identity)).toMatchObject(identity);
    await expect(verifyCliPayload(root, { commit: "b".repeat(40) })).rejects.toThrow(
      /commit mismatch/,
    );
    await writeFile(join(root, "raypx"), "signed bytes");
    await expect(verifyCliPayload(root)).rejects.toThrow(/integrity/);
    await sealCliPayload(root);
    expect(await verifyCliPayload(root, identity)).toMatchObject(identity);
    await writeFile(join(root, "untracked"), "unexpected");
    await expect(verifyCliPayload(root)).rejects.toThrow(/"unexpected":\["untracked"\]/);
    await rm(join(root, "untracked"));
    await rm(join(root, "LICENSE"));
    await expect(verifyCliPayload(root)).rejects.toThrow(/"missing":\["LICENSE"\]/);
    await writeFile(join(root, "LICENSE"), "unsigned");

    if (process.platform === "win32") return;
    await symlink(join(root, "LICENSE"), join(root, "escape"), "file");
    await expect(verifyCliPayload(root)).rejects.toThrow(/regular files/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
