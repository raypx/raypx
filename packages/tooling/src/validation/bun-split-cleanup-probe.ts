// Temporary Windows diagnosis; removed after reducing the controller cleanup failure.
import { mkdtemp, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const root = await mkdtemp(join(tmpdir(), "raypx-cwd-probe-"));
for (const mode of ["async-cwd", "sync-cwd", "async-argument"] as const) {
  const directory = join(root, mode);
  await mkdir(directory);
  const args = [
    process.execPath,
    ...(mode === "async-argument" ? ["--cwd", directory] : []),
    "-e",
    "console.log('done')",
  ];
  const options = {
    cwd: mode === "async-argument" ? process.cwd() : directory,
    stdin: "ignore" as const,
    stdout: "pipe" as const,
    stderr: "pipe" as const,
  };
  if (mode === "sync-cwd") {
    const child = Bun.spawnSync(args, options);
    if (child.exitCode !== 0) throw new Error("Probe child failed");
  } else {
    const child = Bun.spawn(args, options);
    await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
  }
  try {
    await rm(directory, { recursive: true, force: true });
    console.log(`[DEBUG-bun-split-cwd] ${mode}: removed`);
  } catch (error) {
    console.log(`[DEBUG-bun-split-cwd] ${mode}: ${(error as NodeJS.ErrnoException).code}`);
  }
}
