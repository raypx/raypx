import { sleep } from "@raypx/runtime-node/process";
import { describe, expect, it } from "vite-plus/test";
import { runtimeFixtures } from "../../helpers/runtime.ts";

const { fixture } = runtimeFixtures();

describe("local processes", () => {
  it("cancels a running external command by caller-supplied ID", async () => {
    const { runtime, dir } = await fixture();
    const id = crypto.randomUUID();
    const result = runtime.processes.run(
      {
        executable: process.execPath,
        args: ["-e", "setInterval(() => {}, 1000)"],
        cwd: dir,
        timeoutMs: 10000,
      },
      undefined,
      id,
    );
    await sleep(50);
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

  it("reports absolute Node and pnpm paths and preserves user tool precedence", async () => {
    const { runtime, dir } = await fixture();
    const info = (await runtime.request("runtime.info", {})) as { node: string; pnpm: string };
    expect(info).not.toHaveProperty("bun");
    const version = await runtime.processes.run({
      executable: info.node,
      args: ["--version"],
      cwd: dir,
      timeoutMs: 5000,
    });
    expect(version.exitCode).toBe(0);
    expect(version.output.trim()).toBe(`v${process.versions.node}`);
    expect(info.pnpm).toMatch(/pnpm(?:\.exe)?$/);
    const path = await runtime.processes.run({
      executable: process.execPath,
      args: ["-e", "console.log(process.env.PATH)"],
      cwd: dir,
      timeoutMs: 5000,
    });
    expect(path.output.trim().startsWith(process.env.PATH ?? "")).toBe(true);
  });
});
