import { expect, it } from "vite-plus/test";
import { spawnProcess, runProcessSync } from "./process.ts";
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
