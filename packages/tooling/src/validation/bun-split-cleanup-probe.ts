// Temporary Windows diagnosis; removed after reducing the controller cleanup failure.
import { mkdtemp, mkdir, rm, readdir, writeFile } from "node:fs/promises";
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
const fixture = join(root, "offline-package");
await mkdir(join(fixture, "tool"), { recursive: true });
await writeFile(
  join(fixture, "package.json"),
  JSON.stringify({ private: true, dependencies: { "raypx-split-local": "file:./tool" } }),
);
await writeFile(
  join(fixture, "tool/package.json"),
  JSON.stringify({
    name: "raypx-split-local",
    version: "0.0.0",
    bin: { "raypx-split-local": "main.js" },
  }),
);
await writeFile(join(fixture, "tool/main.js"), '#!/usr/bin/env bun\nconsole.log("ok");\n');
const installed = Bun.spawnSync([process.execPath, "install", "--offline", "--ignore-scripts"], {
  cwd: fixture,
  stdout: "pipe",
  stderr: "pipe",
});
console.log(`[DEBUG-bun-split-cwd] install: ${installed.exitCode} ${installed.stderr.toString()}`);
try {
  await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  console.log("[DEBUG-bun-split-cwd] offline install root: removed");
} catch (error) {
  console.log(`[DEBUG-bun-split-cwd] offline install root: ${String(error)}`);
  console.log(
    `[DEBUG-bun-split-cwd] remaining: ${JSON.stringify(await readdir(root, { recursive: true }))}`,
  );
  const cleaned = Bun.spawnSync(
    [
      "powershell.exe",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference='Stop'; [IO.Directory]::Delete($env:RAYPX_DEBUG_CLEANUP, $true)",
    ],
    { env: { ...process.env, RAYPX_DEBUG_CLEANUP: root }, stdout: "pipe", stderr: "pipe" },
  );
  console.log(
    `[DEBUG-bun-split-cwd] .NET cleanup: ${cleaned.exitCode} ${cleaned.stderr.toString()}`,
  );
}
