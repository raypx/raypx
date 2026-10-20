import { describe, expect, it } from "vite-plus/test";
import { runtimeFixtures } from "../helpers/runtime.js";

const { fixture } = runtimeFixtures();

describe("local processes", () => {
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
