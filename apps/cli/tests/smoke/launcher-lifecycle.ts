import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { verifyCliPayload } from "@raypx/tooling/build/cli";
import { enrollTestProfile } from "../helpers/instance";
import { removeTemporaryDirectory } from "../helpers/temporary";

if (process.platform !== "win32") throw new Error("Launcher lifecycle requires Windows");
const payload = resolve(
  process.env.RAYPX_CLI_PAYLOAD ?? resolve(import.meta.dirname, "../../dist"),
);
const manifest = await verifyCliPayload(payload);
const root = await mkdtemp(join(tmpdir(), "raypx 中文 # launcher-"));
const binary = join(payload, "raypx.exe");
const env = { ...process.env, PATH: "", RAYPX_HOME: join(root, "home") };
const close = await enrollTestProfile({ dataDir: root }, [binary], env);
const child = Bun.spawn([binary, "stdio", "--data-dir", root], {
  env,
  stdin: "pipe",
  stdout: "pipe",
  stderr: "ignore",
  windowsHide: true,
});
const reader = child.stdout.getReader();
const owned: number[] = [child.pid];
const timeout = setTimeout(() => child.kill(), 30_000);
const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};
try {
  await child.stdin.write(
    JSON.stringify({ version: 1, id: "ready", method: "runtime.info", params: {} }) + "\n",
  );
  await child.stdin.flush();
  let output = "";
  while (!output.includes('"id":"ready"')) {
    const chunk = await reader.read();
    assert.ok(!chunk.done, "Foreground host exited before readiness");
    output += new TextDecoder().decode(chunk.value);
  }
  const powershell = join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32/WindowsPowerShell/v1.0/powershell.exe",
  );
  const inspect = Bun.spawn(
    [
      powershell,
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference='Stop'; @(Get-CimInstance Win32_Process -Filter ('ParentProcessId=' + $env:RAYPX_TEST_PARENT_PID) | ForEach-Object { [int]$_.ProcessId }) | ConvertTo-Json -Compress",
    ],
    {
      env: { ...env, RAYPX_TEST_PARENT_PID: String(child.pid) },
      stdout: "pipe",
      stderr: "ignore",
      timeout: 20_000,
    },
  );
  const text = (await new Response(inspect.stdout).text()).trim();
  assert.equal(await inspect.exited, 0);
  const pids = text ? (JSON.parse(text) as number | number[]) : [];
  owned.push(...(Array.isArray(pids) ? pids : [pids]));
  if (manifest.files["bun.exe"])
    assert.equal(owned.length, 2, "Split launcher must own one Bun child");
  child.kill();
  await child.exited;
  const deadline = Date.now() + 15_000;
  while (owned.some(alive)) {
    assert.ok(Date.now() < deadline, "Terminating the launcher left its Bun child running");
    await Bun.sleep(25);
  }
  console.log(
    "Foreground launcher termination leaves no Bun process; EOF/task cleanup is covered by artifact acceptance",
  );
} finally {
  clearTimeout(timeout);
  reader.releaseLock();
  try {
    await child.stdin.end();
  } catch {
    /* Terminated stdin may already be closed. */
  }
  for (const pid of owned) if (alive(pid)) process.kill(pid, "SIGKILL");
  await child.exited;
  await close();
  await removeTemporaryDirectory(root);
}
