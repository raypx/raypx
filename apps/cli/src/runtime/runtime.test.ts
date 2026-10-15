import { afterEach, describe, expect, it } from "vite-plus/test";
import { chmod, mkdtemp, mkdir, readFile, rm, stat, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRuntime, type LocalRuntime } from "./index";
import { acquireLock } from "./state";

const roots: string[] = [];
const runtimes: LocalRuntime[] = [];
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), "raypx-local-test-"));
  roots.push(dir);
  const authorized = join(dir, "files");
  await mkdir(authorized);
  const runtime = createRuntime({ dataDir: dir });
  runtimes.push(runtime);
  const grant = await runtime.files.register(authorized);
  return { dir, authorized, runtime, grant };
}
afterEach(async () => {
  await Promise.all(runtimes.splice(0).map((runtime) => runtime.close()));
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});
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
    ).rejects.toThrow();
    await runtime.request("files.delete", {
      rootId: grant.id,
      path: "delete.txt",
      version: file.version,
      confirmed: true,
    });
    expect((await runtime.files.list(grant.id, "", 0, 100)).total).toBe(0);
  });
});
describe("device jobs and leases", () => {
  it("excludes a second scheduler and releases the lease after shutdown", async () => {
    const { dir } = await fixture();
    const first = createRuntime({ dataDir: dir, scheduler: true });
    runtimes.push(first);
    expect(() => createRuntime({ dataDir: dir, scheduler: true })).toThrow(/Another Desktop/);
    await first.close();
    runtimes.splice(runtimes.indexOf(first), 1);
    const second = createRuntime({ dataDir: dir, scheduler: true });
    runtimes.push(second);
    expect(second.jobs.list()).toEqual([]);
  });
  it("persists task definitions and skips manual execution while another owner holds its lease", async () => {
    const { runtime, grant } = await fixture();
    const task = runtime.jobs.create({
      name: "Scan",
      cron: "0 * * * *",
      timezone: "Asia/Singapore",
      enabled: true,
      action: { type: "directory.scan", rootId: grant.id, path: "" },
    });
    expect(task.nextRuns).toHaveLength(5);
    const release = acquireLock(runtime.state.directory, `job-${task.id}`)!;
    expect((await runtime.jobs.run(task.id)).status).toBe("skipped");
    release();
    expect((await runtime.jobs.run(task.id)).status).toBe("success");
    expect(runtime.state.history(task.id)).toHaveLength(2);
    expect(() => runtime.jobs.create({ ...task, cron: "* * * * * *" })).toThrow(/five-field/);
  });
  it("cancels a running external command by caller-supplied ID", async () => {
    const { runtime, dir } = await fixture();
    const id = crypto.randomUUID();
    const result = runtime.processes.run(
      {
        executable: process.execPath,
        args: ["-e", "await Bun.sleep(60000)"],
        cwd: dir,
        timeoutMs: 10000,
      },
      undefined,
      id,
    );
    await Bun.sleep(50);
    expect(runtime.processes.cancel(id)).toEqual({ cancelled: true });
    expect((await result).cancelled).toBe(true);
  });
  it("refuses a newer schema and never migrates while another runtime holds a lease", async () => {
    const { runtime, dir } = await fixture();
    runtime.state.db.exec("PRAGMA user_version=0");
    expect(() => createRuntime({ dataDir: dir })).toThrow(/locked/i);
    runtime.state.db.exec("PRAGMA user_version=2");
    expect(() => createRuntime({ dataDir: dir })).toThrow(/newer Raypx/);
    runtime.state.db.exec("PRAGMA user_version=1");
  });
  it("runs an absolute executable and retains bounded output", async () => {
    const { runtime, dir } = await fixture();
    const result = await runtime.processes.run({
      executable: process.execPath,
      args: ["-e", "console.log('raypx-command')"],
      cwd: dir,
      timeoutMs: 5000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("raypx-command");
    await expect(
      runtime.processes.run({ executable: "bun", args: [], cwd: dir, timeoutMs: 1000 }),
    ).rejects.toMatchObject({ code: "ABSOLUTE_PATH_REQUIRED" });
  });
});
