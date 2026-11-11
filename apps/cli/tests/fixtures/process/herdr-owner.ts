import { HerdrTerminalHost } from "../../../src/runtime/process/herdr.js";
import { join } from "node:path";
const [binary, cwd, report, ...compiled] = process.argv.slice(2);
const commandReport = report + ".command";
const host = new HerdrTerminalHost(
  binary!,
  () => {},
  () => process.env,
  compiled.length ? compiled : undefined,
);
await host.open(
  {
    executable: process.execPath,
    args: [
      "-e",
      `
  const child = Bun.spawn([process.execPath, '-e', 'setInterval(() => {}, 1000)'], { stdin: 'inherit', stdout: 'inherit', stderr: 'inherit' });
  await Bun.write(${JSON.stringify(commandReport)}, JSON.stringify([process.pid, child.pid]));
  setInterval(() => {}, 1000);
`,
    ],
    cwd: cwd!,
    timeoutMs: 20000,
  },
  80,
  24,
);
while (!(await Bun.file(commandReport).exists())) await Bun.sleep(10);
const pids: number[] = await Bun.file(commandReport).json();
if (process.platform === "win32") {
  const inspect = Bun.spawn(
    [
      join(
        process.env.SystemRoot ?? "C:\\Windows",
        "System32/WindowsPowerShell/v1.0/powershell.exe",
      ),
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `
$ErrorActionPreference='Stop'
$all = @(Get-CimInstance Win32_Process)
$owned = [Collections.Generic.HashSet[int]]::new()
[void]$owned.Add([int]$env:RAYPX_TEST_OWNER_PID)
do {
  $added = $false
  foreach ($item in $all) {
    if ($owned.Contains([int]$item.ParentProcessId)) {
      if ($owned.Add([int]$item.ProcessId)) { $added = $true }
    }
  }
} while ($added)
@($owned) | ConvertTo-Json -Compress
`,
    ],
    {
      env: { ...process.env, RAYPX_TEST_OWNER_PID: String(process.pid) },
      stdin: "ignore",
      stdout: "pipe",
      stderr: "ignore",
      windowsHide: true,
      timeout: 15_000,
    },
  );
  const tree = await new Response(inspect.stdout).json();
  if ((await inspect.exited) !== 0 || !Array.isArray(tree))
    throw new Error("Could not inspect owned Herdr processes");
  pids.push(...tree);
}
await Bun.write(report!, JSON.stringify([...new Set(pids)]));
console.log("ready");
await Bun.stdin.text();
await host.close();
