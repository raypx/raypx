import { describe, expect, it } from "vite-plus/test";
import { chmod, readFile, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRuntime } from "../../src/runtime/index.js";
import { runtimeFixtures } from "../helpers/runtime.js";

const { fixture, runtimes } = runtimeFixtures();

describe("authorized local files", () => {
  it("persists canonical grants and edits only the current version", async () => {
    const { runtime, grant, authorized } = await fixture();
    const created = await runtime.files.write(grant.id, "hello.txt", "你好", null);
    expect((await runtime.files.read(grant.id, "hello.txt")).text).toBe("你好");
    await expect(runtime.files.write(grant.id, "hello.txt", "stale", null)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const updated = await runtime.files.write(grant.id, "hello.txt", "updated", created.version);
    await runtime.files.move(grant.id, "hello.txt", "moved.txt", updated.version);
    expect(await readFile(join(authorized, "moved.txt"), "utf8")).toBe("updated");
    expect(runtime.state.roots()).toHaveLength(1);
  });

  it("allows only one concurrent managed edit of the same version across runtimes", async () => {
    const { runtime, grant, dir } = await fixture();
    const file = await runtime.files.write(grant.id, "concurrent.txt", "initial", null);
    const second = createRuntime({ dataDir: dir });
    runtimes.push(second);
    const results = await Promise.allSettled([
      runtime.files.write(grant.id, "concurrent.txt", "first", file.version),
      second.files.write(grant.id, "concurrent.txt", "second", file.version),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((result) => result.status === "rejected");
    expect(
      failure?.status === "rejected" && ["BUSY", "CONFLICT"].includes(failure.reason.code),
    ).toBe(true);
  });

  it.runIf(process.platform !== "win32")(
    "preserves executable permissions when atomically editing an existing file",
    async () => {
      const { runtime, grant, authorized } = await fixture();
      await runtime.files.write(grant.id, "script.sh", "#!/bin/sh\n", null);
      await chmod(join(authorized, "script.sh"), 0o700);
      const file = await runtime.files.stat(grant.id, "script.sh");
      await runtime.files.write(grant.id, "script.sh", "#!/bin/sh\necho updated\n", file.version);
      expect((await stat(join(authorized, "script.sh"))).mode & 0o777).toBe(0o700);
    },
  );

  it("finishes an accepted atomic save before closing state and rejects later work", async () => {
    const { runtime, grant, authorized } = await fixture();
    const text = "pending-save".repeat(80_000);
    const write = runtime.request("files.write", {
      rootId: grant.id,
      path: "save-on-quit.txt",
      text,
      version: null,
    });
    const closing = runtime.close();
    expect(runtime.close()).toBe(closing);
    await expect(runtime.request("roots.list", {})).rejects.toMatchObject({ code: "CLOSING" });
    await expect(write).resolves.toMatchObject({ text });
    await closing;
    expect(await readFile(join(authorized, "save-on-quit.txt"), "utf8")).toBe(text);
  });

  it("rejects traversal, symlinks, root removal and oversized UTF-8 text", async () => {
    const { runtime, grant, dir, authorized } = await fixture();
    await writeFile(join(dir, "secret"), "private");
    await symlink(join(dir, "secret"), join(authorized, "link"));
    await expect(runtime.files.read(grant.id, "../secret")).rejects.toMatchObject({
      code: "INVALID_PATH",
    });
    await expect(runtime.files.read(grant.id, "link")).rejects.toMatchObject({ code: "SYMLINK" });
    await expect(runtime.files.delete(grant.id, "", "invalid")).rejects.toMatchObject({
      code: "INVALID_PATH",
    });
    await expect(runtime.files.delete(grant.id, ".", "invalid")).rejects.toMatchObject({
      code: "INVALID_PATH",
    });
    await expect(
      runtime.files.write(grant.id, "large", "中".repeat(400000), null),
    ).rejects.toMatchObject({ code: "TOO_LARGE" });
  });

  it("requires confirmed delete on the public runtime interface", async () => {
    const { runtime, grant } = await fixture();
    const file = await runtime.files.write(grant.id, "delete.txt", "bye", null);
    await expect(
      runtime.request("files.delete", {
        rootId: grant.id,
        path: "delete.txt",
        version: file.version,
      }),
    ).rejects.toThrow(/confirmed/);
    await runtime.request("files.delete", {
      rootId: grant.id,
      path: "delete.txt",
      version: file.version,
      confirmed: true,
    });
    expect((await runtime.files.list(grant.id, "", 0, 100)).total).toBe(0);
  });
});
