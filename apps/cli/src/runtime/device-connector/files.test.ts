import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureDeviceDirectory, DeviceFiles, relativeDevicePath } from "./files.js";
import { LocalError } from "../errors.js";
import type { LocalDeviceGrant } from "./storage.js";

const directories: string[] = [];
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});
async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "raypx-device-files-"));
  directories.push(directory);
  const root = join(directory, "grant");
  const outside = join(directory, "outside");
  await mkdir(root);
  await mkdir(outside);
  await writeFile(join(root, "inside.txt"), "inside");
  await writeFile(join(outside, "secret.txt"), "outside");
  const identity = captureDeviceDirectory(root);
  const grant: LocalDeviceGrant = {
    dev: identity.dev,
    ino: identity.ino,
    grant: {
      id: "grant",
      deviceId: "device",
      spaceId: "space",
      directory: identity.directory,
      revision: 1,
    },
  };
  return { directory, root, outside, grant, files: new DeviceFiles(join(directory, "private")) };
}
describe("device directory confinement", () => {
  it.each(["../secret", "a/../secret", "/etc/passwd", "a\\b", "C:/secret", "a\0b"])(
    "refuses path %s",
    (path) => {
      expect(() => relativeDevicePath(path)).toThrow(/path|traversal/i);
    },
  );
  it.skipIf(process.platform === "win32")(
    "reads and writes only regular files through held no-follow descriptors",
    async () => {
      const { root, grant, files } = await fixture();
      expect(await files.read(grant, "inside.txt", 4)).toEqual({
        bytes: Buffer.from("insi").toString("base64"),
        size: 6,
        truncated: true,
      });
      await files.write(grant, "new.txt", Buffer.from("new").toString("base64"));
      expect(await readFile(join(root, "new.txt"), "utf8")).toBe("new");
      expect((await files.list(grant, ".", 1)).entries).toHaveLength(1);
    },
  );
  it.skipIf(process.platform === "win32")(
    "refuses final and ancestor symlinks for read/write/cwd",
    async () => {
      const { root, outside, grant, files } = await fixture();
      await symlink(outside, join(root, "link"));
      await symlink(join(outside, "secret.txt"), join(root, "file"));
      await expect(files.read(grant, "link/secret.txt", 100)).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
      await expect(files.write(grant, "link/new.txt", "eA==")).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
      await expect(files.read(grant, "file", 100)).rejects.toMatchObject({ code: "ACCESS_DENIED" });
      await expect(files.write(grant, "file", "eA==")).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
      await expect(files.cwd(grant, "link")).rejects.toMatchObject({ code: "ACCESS_DENIED" });
      expect(await readFile(join(outside, "secret.txt"), "utf8")).toBe("outside");
    },
  );
  it.skipIf(process.platform === "win32")(
    "rejects a replaced granted directory and a replaced ancestor",
    async () => {
      const { directory, root, outside, grant, files } = await fixture();
      await rename(root, join(directory, "old"));
      await symlink(outside, root);
      await expect(files.read(grant, "secret.txt", 100)).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
      await rm(root);
      await mkdir(root);
      await expect(files.write(grant, "new.txt", "eA==")).rejects.toMatchObject({
        code: "ACCESS_DENIED",
      });
    },
  );
  it("keeps private connector/profile credentials outside broad grants", async () => {
    const { directory } = await fixture();
    const privateDirectory = join(directory, "private");
    await mkdir(privateDirectory);
    await writeFile(join(privateDirectory, "credential"), "hidden");
    const identity = captureDeviceDirectory(directory);
    const grant: LocalDeviceGrant = {
      ...identity,
      grant: {
        id: "broad",
        deviceId: "d",
        spaceId: "s",
        directory: identity.directory,
        revision: 1,
      },
    };
    const files = new DeviceFiles(privateDirectory);
    await expect(files.read(grant, "private/credential", 100)).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
    await expect(files.write(grant, "private/credential", "eA==")).rejects.toMatchObject({
      code: "ACCESS_DENIED",
    });
  });
  it("rejects oversized file budgets", async () => {
    const { grant, files } = await fixture();
    await expect(files.read(grant, "inside.txt", 1024 * 1024 + 1)).rejects.toMatchObject({
      code: "LIMIT_EXCEEDED",
    });
    await expect(
      files.write(grant, "large.txt", Buffer.alloc(1024 * 1024 + 1).toString("base64")),
    ).rejects.toMatchObject({ code: "LIMIT_EXCEEDED" });
  });
});

it.skipIf(process.platform !== "win32")(
  "reports Windows secure file operations unavailable without a path fallback",
  async () => {
    const { grant, files } = await fixture();
    await expect(files.read(grant, "inside.txt", 10)).rejects.toMatchObject({
      code: "CONNECTOR_PLATFORM_UNAVAILABLE",
    });
  },
);

it.skipIf(process.platform === "win32")(
  "checks cancellation again after opening the granted root and before creating a file",
  async () => {
    const { grant, files, root } = await fixture();
    await expect(
      files.write(grant, "cancelled.txt", "eA==", () => {
        throw new LocalError("CANCELLED", "Cancelled");
      }),
    ).rejects.toMatchObject({ code: "CANCELLED" });
    await expect(readFile(join(root, "cancelled.txt"))).rejects.toMatchObject({ code: "ENOENT" });
  },
);
