import { rm } from "node:fs/promises";
import { join } from "node:path";

/** Snapshot descendants before taskkill can orphan a ConPTY helper by killing its parent. */
export async function stopWindowsHerdrTree(pid: number) {
  const system = join(process.env.SystemRoot ?? "C:\\Windows", "System32");
  const child = Bun.spawn(
    [
      join(system, "WindowsPowerShell/v1.0/powershell.exe"),
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `
$ErrorActionPreference = 'Stop'
$ownerId = [int]$env:RAYPX_HERDR_STOP_PID
$processes = @(Get-CimInstance Win32_Process)
$owned = @{}
$pending = [Collections.Generic.Queue[int]]::new()
$pending.Enqueue($ownerId)
while ($pending.Count -gt 0) {
  $parentId = $pending.Dequeue()
  foreach ($item in $processes) {
    if ($item.ProcessId -eq $parentId) { $owned[[int]$item.ProcessId] = $item }
    if ($item.ParentProcessId -eq $parentId -and -not $owned.ContainsKey([int]$item.ProcessId)) {
      $owned[[int]$item.ProcessId] = $item
      $pending.Enqueue([int]$item.ProcessId)
    }
  }
}
$ErrorActionPreference = 'Continue'
& (Join-Path $env:SystemRoot 'System32/taskkill.exe') /PID $ownerId /T /F 2>&1 | Out-Null
$ErrorActionPreference = 'Stop'
foreach ($item in @(Get-CimInstance Win32_Process)) {
  $original = $owned[[int]$item.ProcessId]
  if ($null -ne $original -and $item.CreationDate -eq $original.CreationDate) {
    $remaining = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
    if ($null -ne $remaining) {
      try { $remaining.Kill() } catch { if (-not $remaining.HasExited) { throw } }
      if (-not $remaining.WaitForExit(5000)) { throw 'Herdr descendant did not exit' }
    }
  }
}
exit 0
`,
    ],
    {
      env: { ...process.env, RAYPX_HERDR_STOP_PID: String(pid) },
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      windowsHide: true,
      timeout: 15_000,
    },
  );
  if ((await child.exited) !== 0) throw new Error("Could not stop the owned Herdr process tree");
}

/** Windows can release a terminated process's working directory asynchronously. */
export async function removeHerdrDirectory(
  path: string,
  remove = (directory: string) => rm(directory, { recursive: true, force: true }),
  wait: (milliseconds: number) => Promise<unknown> = Bun.sleep,
) {
  for (let attempt = 0; ; attempt++) {
    try {
      await remove(path);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 10 || !["EBUSY", "EPERM", "ENOTEMPTY"].includes(code ?? "")) throw error;
      await wait(100 + attempt * 50);
    }
  }
}
