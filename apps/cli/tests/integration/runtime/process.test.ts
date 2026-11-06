import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import { describe, expect, it } from "vite-plus/test";
import { runtimeFixtures } from "../../helpers/runtime.js";

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

  it.skipIf(process.platform === "win32")(
    "lets commands run the embedded Bun from the end of PATH",
    async () => {
      const { runtime, dir } = await fixture();
      const info = (await runtime.request("runtime.info", {})) as { bun: string | null };
      expect(info.bun).toBeTypeOf("string");
      const run = (executable: string, args: string[]) =>
        runtime.processes.run({ executable, args, cwd: dir, timeoutMs: 10000 });
      const version = await run(info.bun!, ["--version"]);
      expect(version.exitCode).toBe(0);
      expect(version.output.trim()).toBe(Bun.version);
      const bunx = await run(join(dirname(info.bun!), "bunx"), ["--help"]);
      expect(stripVTControlCharacters(bunx.output)).toContain("Usage: bunx");
      // A PATH of only the shim directory proves `bun` resolved there, not to an installed Bun.
      const script = join(dir, "script.ts");
      await writeFile(script, "console.log('bundled', typeof Bun.serve)");
      const shell = await run("/bin/sh", [
        "-c",
        'PATH="$1" bun run "$0"',
        script,
        dirname(info.bun!),
      ]);
      expect(shell.output).toContain("bundled function");
      const path = await run("/bin/sh", ["-c", 'printf "%s" "$PATH"']);
      expect(path.output.split(":").at(-1)).toBe(dirname(info.bun!));
    },
  );
});
