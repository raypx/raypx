import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { verifyCliPayload } from "@raypx/tooling/build/cli";
import { enrollTestProfile } from "../helpers/instance";
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
  await rename(distribution, join(root, "moved-original"));
  await rm(join(root, "moved-original"), { recursive: true });
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
  await rm(root, { recursive: true, force: true });
}
