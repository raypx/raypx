import { afterEach, expect, it } from "vite-plus/test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnProcess, run, runProcessSync } from "./process.ts";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});
function directory() {
  const root = mkdtempSync(join(tmpdir(), "raypx process 中文 "));
  roots.push(root);
  return root;
}
it("forwards arguments and standard streams without shell expansion", async () => {
  const child = spawnProcess(
    [
      process.execPath,
      "-e",
      "process.stdin.pipe(process.stdout);process.stderr.write(process.argv[1])",
      "中文 path $(literal)",
    ],
    { stdin: "pipe" },
  );
  child.stdin.end("input");
  const [output, error, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  expect(output).toBe("input");
  expect(error).toBe("中文 path $(literal)");
  expect(code).toBe(0);
});
it("retains exit status and rejects a missing executable", async () => {
  expect(runProcessSync([process.execPath, "-e", "process.exit(23)"]).exitCode).toBe(23);
  await expect(spawnProcess(["/missing-raypx-executable"]).exited).rejects.toMatchObject({
    code: "ENOENT",
  });
});
it("runs inherited-stream commands with literal arguments and cleans up on failure", async () => {
  const root = directory();
  const before = [process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")];
  writeFileSync(
    join(root, "capture.mjs"),
    `import { writeFileSync } from 'node:fs';
writeFileSync('result.json', JSON.stringify({ args: process.argv.slice(2), value: process.env.RAYPX_PROCESS_TEST }));`,
  );
  await run(process.execPath, ["capture.mjs", "中文 $(literal) & space"], root, {
    ...process.env,
    RAYPX_PROCESS_TEST: "inherited environment",
  });
  expect(JSON.parse(readFileSync(join(root, "result.json"), "utf8"))).toEqual({
    args: ["中文 $(literal) & space"],
    value: "inherited environment",
  });
  await expect(run(process.execPath, ["-e", "process.exit(23)"], root)).rejects.toThrow(
    "exited 23",
  );
  await expect(run("/missing-raypx-executable", [], root)).rejects.toMatchObject({
    code: "ENOENT",
  });
  expect([process.listenerCount("SIGINT"), process.listenerCount("SIGTERM")]).toEqual(before);
});
it.skipIf(process.platform !== "win32")("executes Windows command shims by name", async () => {
  const root = directory();
  writeFileSync(join(root, "raypx-command.cmd"), "@echo off\r\necho %~1>result.txt\r\n");
  await run("raypx-command", ["argument with spaces"], root);
  expect(readFileSync(join(root, "result.txt"), "utf8").trim()).toBe("argument with spaces");
});
it.skipIf(process.platform === "win32")(
  "reports termination after a real process signal",
  async () => {
    const child = spawnProcess([
      process.execPath,
      "-e",
      "console.log('ready');setInterval(()=>{},1000)",
    ]);
    const reader = child.stdout.getReader();
    await reader.read();
    child.kill("SIGTERM");
    expect(await child.exited).toBe(143);
    await reader.cancel();
  },
);
