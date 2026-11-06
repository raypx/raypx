import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, realpath, rename } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { verifyCliPayload } from "@raypx/tooling/build/cli";
import { enrollTestProfile } from "../helpers/instance";
import { removeTemporaryDirectory } from "../helpers/temporary";
import { daemonFetch, readDaemon } from "../../src/runtime/daemon/endpoint";
import { profilePath } from "../../src/runtime/state";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
if (process.platform !== "win32") throw new Error("Windows payload lifecycle requires Windows");
const root = await mkdtemp(join(tmpdir(), "raypx 中文 # payload "));
const distribution = join(root, "extracted"),
  data = join(root, "data"),
  home = join(root, "config");
const source = resolve(process.env.RAYPX_CLI_PAYLOAD ?? resolve(import.meta.dirname, "../../dist"));
await cp(source, distribution, { recursive: true });
const manifest = await verifyCliPayload(distribution);
const binary = join(distribution, "raypx.exe");
const env = {
  ...process.env,
  PATH: "",
  RAYPX_HOME: home,
  CLAUDE_CONFIG_DIR: join(root, "claude"),
  CODEX_HOME: join(root, "codex"),
};
const close = await enrollTestProfile({ dataDir: data, profile: "payload" }, [binary], env);
const runtime = join(data, "bin/daemon", `${manifest.version}-${manifest.builtAt}`);
const powershell = join(
  process.env.SystemRoot ?? "C:\\Windows",
  "System32/WindowsPowerShell/v1.0/powershell.exe",
);
let runtimeImage: string | undefined;
async function waitForRuntimeExit() {
  if (!runtimeImage) return;
  const child = Bun.spawn(
    [
      powershell,
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      String.raw`
$ErrorActionPreference = 'Stop'
$deadline = [DateTime]::UtcNow.AddSeconds(30)
$owned = @(Get-Process -Name raypx -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $env:RAYPX_TEST_RUNTIME_EXE })
foreach ($process in $owned) {
  try {
    $remaining = [Math]::Max(0, [int]($deadline - [DateTime]::UtcNow).TotalMilliseconds)
    if (!$process.WaitForExit($remaining)) { throw 'Stopped runtime retained a process' }
  } finally { $process.Dispose() }
}
exit 0
`,
    ],
    {
      env: { ...env, RAYPX_TEST_RUNTIME_EXE: runtimeImage },
      stdout: "ignore",
      stderr: "ignore",
      timeout: 35_000,
      windowsHide: true,
    },
  );
  assert.equal(await child.exited, 0, "Stopped Windows runtime retained processes after 30s");
}
async function invoke(exe: string, args: string[]) {
  const child = Bun.spawn([exe, ...args, "--data-dir", data, "--profile", "payload", "--json"], {
    env,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 90_000,
  });
  const [stdout, , code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  assert.equal(code, 0, "Windows payload lifecycle command failed");
  return JSON.parse(stdout);
}
let daemonStarted = false;
try {
  await mkdir(home, { recursive: true });
  await invoke(binary, ["connectors", "install", "claude"]);
  await invoke(binary, ["daemon", "start"]);
  daemonStarted = true;
  await verifyCliPayload(runtime);
  const stable = join(home, "bin/raypx.exe");
  const installation = await Bun.file(join(home, "bin/installation.json")).json();
  await verifyCliPayload(join(home, "bin", installation.directory));
  const endpoint = readDaemon(profilePath({ dataDir: data, profile: "payload" }));
  const response = await daemonFetch(endpoint, "/info");
  assert.equal(response.status, 200);
  const info = (await response.json()) as { pid: number };
  assert.ok(Number.isSafeInteger(info.pid) && info.pid > 0);
  const image = Bun.spawn(
    [
      powershell,
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$ErrorActionPreference = 'Stop'; [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false); (Get-Process -Id ([int]$env:RAYPX_TEST_DAEMON_PID)).Path",
    ],
    {
      env: { ...env, RAYPX_TEST_DAEMON_PID: String(info.pid) },
      stdout: "pipe",
      stderr: "ignore",
      timeout: 15_000,
      windowsHide: true,
    },
  );
  const [imagePath, imageCode] = await Promise.all([
    new Response(image.stdout).text(),
    image.exited,
  ]);
  assert.equal(imageCode, 0, "Could not inspect the isolated daemon image");
  assert.equal(
    (await realpath(imagePath.trim())).toLowerCase(),
    (await realpath(join(runtime, "raypx.exe"))).toLowerCase(),
    "Daemon must run from its complete versioned copy",
  );
  runtimeImage = imagePath.trim();
  const moved = join(root, "moved-original");
  const moveDeadline = Date.now() + 5000;
  for (;;) {
    try {
      await rename(distribution, moved);
      break;
    } catch (error) {
      // Exited CLI processes and file scanners can briefly retain Windows handles.
      if (
        Date.now() >= moveDeadline ||
        !["EBUSY", "EPERM", "EACCES"].includes((error as NodeJS.ErrnoException).code ?? "")
      )
        throw error;
      await Bun.sleep(100);
    }
  }
  await removeTemporaryDirectory(moved);
  // The first PTY is opened only after the downloaded directory no longer exists.
  const child = Bun.spawn([stable, "daemon", "proxy", "--data-dir", data, "--profile", "payload"], {
    env,
    stdin: "pipe",
    stdout: "pipe",
    stderr: "ignore",
  });
  const reader = createInterface({ input: Readable.fromWeb(child.stdout) });
  const timeout = setTimeout(() => child.kill(), 90_000);
  try {
    await child.stdin.write(
      JSON.stringify({
        version: 1,
        id: "open",
        method: "terminal.open",
        params: {
          executable:
            process.env.ComSpec ??
            process.env.COMSPEC ??
            join(process.env.SystemRoot ?? "C:\\Windows", "System32", "cmd.exe"),
          args: ["/D", "/Q", "/C", "echo preserved-payload & exit /b 17"],
          cwd: root,
          cols: 80,
          rows: 24,
          timeoutMs: 10_000,
        },
      }) + "\n",
    );
    await child.stdin.flush();
    let opened = false,
      exited = false;
    for await (const line of reader) {
      const message = JSON.parse(line);
      if (message.id === "open") {
        assert.ok(
          !message.error,
          `Copied daemon rejected terminal.open (${message.error?.code ?? "unknown"})`,
        );
        opened = true;
      }
      if (message.event === "terminal.exit") {
        assert.equal(message.data.exitCode, 17);
        exited = true;
        break;
      }
    }
    assert.ok(opened && exited, "Copied daemon did not complete the PTY");
  } finally {
    clearTimeout(timeout);
    await child.stdin.end();
    child.kill();
    await child.exited;
    reader.close();
  }
  await invoke(stable, ["daemon", "restart"]);
  await invoke(stable, ["daemon", "stop"]);
  daemonStarted = false;
  console.log("Windows complete payload survives source removal, first PTY and daemon restart");
} finally {
  if (daemonStarted) await invoke(join(runtime, "raypx.exe"), ["daemon", "stop"]);
  await close();
  await waitForRuntimeExit();
  await removeTemporaryDirectory(root);
}
