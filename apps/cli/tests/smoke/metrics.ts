import assert from "node:assert/strict";
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnProcess, sleep } from "@raypx/runtime-node/process";
import { enrollTestProfile } from "../helpers/instance.ts";

// Linux measurements are evidence for the standalone CLI, not Desktop acceptance.
assert.equal(process.platform, "linux", "This RSS probe requires Linux /proc");
const root = resolve(import.meta.dirname, "../../../..");
const distribution = join(root, "apps/cli/dist");
const launch = [process.execPath, join(distribution, "main.mjs")];
const temporary = await mkdtemp(join(tmpdir(), "raypx runtime metrics-"));
const output = join(root, ".artifacts/migration", new Date().toISOString().replaceAll(":", "-"));
await mkdir(output, { recursive: true });
const inventory = JSON.parse(await readFile(join(distribution, "runtime.json"), "utf8")) as {
  version: string;
  builtAt: number;
  nodeVersion: string;
};
async function invoke(args: string[]) {
  const child = spawnProcess([...launch, ...args], {
    cwd: temporary,
    env: { ...process.env, PATH: "" },
    stdin: "ignore",
    stdout: "pipe",
    stderr: "ignore",
    timeout: 30_000,
  });
  const [code, text] = await Promise.all([child.exited, new Response(child.stdout).text()]);
  assert.equal(code, 0, "Packaged CLI measurement command failed");
  return text;
}
const groups: Record<string, number> = {};
let fileCount = 0;
async function size(directory: string, prefix = "") {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = prefix + entry.name;
    const file = join(directory, entry.name);
    if (entry.isDirectory()) await size(file, name + "/");
    else {
      assert.ok(entry.isFile(), "Distribution must contain only regular files");
      const group = name.startsWith("runtime/")
        ? "node"
        : name.startsWith("herdr/")
          ? "herdr"
          : "application";
      groups[group] = (groups[group] ?? 0) + (await stat(file)).size;
      fileCount++;
    }
  }
}
let closeEnrollment = async () => {};
let daemon:
  | ReturnType<typeof spawnProcess<{ stdin: "ignore"; stdout: "ignore"; stderr: "ignore" }>>
  | undefined;
try {
  await size(distribution);
  const archive = join(temporary, "raypx.tar.gz");
  const tar = spawnProcess(["tar", "-czf", archive, "-C", distribution, "."], {
    stdin: "ignore",
    stdout: "ignore",
    stderr: "inherit",
  });
  assert.equal(await tar.exited, 0);
  const startupMs: number[] = [];
  for (let index = 0; index < 15; index++) {
    const start = performance.now();
    assert.equal((await invoke(["--version"])).trim(), inventory.version);
    startupMs.push(performance.now() - start);
  }
  const dataDir = join(temporary, "profile");
  closeEnrollment = await enrollTestProfile({ dataDir }, launch);
  const start = performance.now();
  daemon = spawnProcess([...launch, "daemon", "run", "--data-dir", dataDir], {
    cwd: temporary,
    env: { ...process.env, PATH: "" },
    stdin: "ignore",
    stdout: "ignore",
    stderr: "ignore",
  });
  const deadline = Date.now() + 30_000;
  while (
    !(
      JSON.parse(await invoke(["daemon", "status", "--data-dir", dataDir, "--json"])) as {
        running: boolean;
      }
    ).running
  ) {
    assert.ok(Date.now() < deadline, "Daemon readiness timed out");
    await sleep(50);
  }
  const readyMs = performance.now() - start;
  await sleep(1000);
  const rssBytes: number[] = [];
  for (let index = 0; index < 5; index++) {
    const status = await readFile(`/proc/${daemon.pid}/status`, "utf8");
    const value = /^VmRSS:\s+(\d+) kB$/m.exec(status)?.[1];
    assert.ok(value, "Daemon RSS unavailable");
    rssBytes.push(Number(value) * 1024);
    await sleep(100);
  }
  await invoke(["daemon", "stop", "--data-dir", dataDir, "--json"]);
  assert.equal(await daemon.exited, 0);
  const report = {
    measuredAt: new Date().toISOString(),
    platform: `${process.platform}-${process.arch}`,
    ...inventory,
    files: undefined,
    fileCount,
    unpackedBytes: Object.values(groups).reduce((sum, bytes) => sum + bytes, 0),
    gzipTarBytes: (await stat(archive)).size,
    groups,
    startup: { operation: "--version", cache: "OS cache uncontrolled", samplesMs: startupMs },
    daemon: { readyMs, idleRssBytes: rssBytes, scope: "Node owner process only; no active tasks" },
    baseline: null,
    desktop: "macOS/Windows package size, startup and memory not measured",
  };
  await writeFile(join(output, "metrics.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`Runtime metrics: ${output}/metrics.json`);
} finally {
  if (daemon?.exitCode === null) {
    daemon.kill();
    await daemon.exited;
  }
  await closeEnrollment();
  await rm(temporary, { recursive: true, force: true });
}
