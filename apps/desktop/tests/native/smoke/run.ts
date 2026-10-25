import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { SESSION_KEY_SERVICE, sessionKeyName } from "../../../native/cookies";
import assert from "node:assert/strict";

const { packageManager } = await Bun.file(
  resolve(import.meta.dirname, "../../../../../package.json"),
).json();

async function run(phase: string, directory: string, restoredServer = false) {
  const child = Bun.spawn([process.execPath, "--bun", "electrobun", "dev"], {
    cwd: resolve(import.meta.dirname, "../../.."),
    env: {
      ...process.env,
      RAYPX_NATIVE_SMOKE: "1",
      RAYPX_NATIVE_SMOKE_PHASE: phase,
      RAYPX_NATIVE_SMOKE_DATA_DIR: directory,
      RAYPX_NATIVE_SMOKE_RESTORED_SERVER: String(restoredServer),
      // The packaged smoke cannot read the repository; it checks the CLI runtime against this pin.
      RAYPX_NATIVE_SMOKE_BUN: packageManager,
    },
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
    detached: process.platform !== "win32",
  });
  let output = "";
  let timedOut = false;
  const drain = async (stream: ReadableStream<Uint8Array>, destination: NodeJS.WriteStream) => {
    const decoder = new TextDecoder();
    for await (const chunk of stream) {
      const text = decoder.decode(chunk, { stream: true });
      output = (output + text).slice(-65536);
      destination.write(text);
    }
  };
  const readers = [drain(child.stdout, process.stdout), drain(child.stderr, process.stderr)];
  const timeout = setTimeout(
    () => {
      timedOut = true;
      console.error("Native smoke exceeded its deadline");
      if (process.platform === "win32") {
        void Bun.spawn(
          [
            join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
            "/PID",
            String(child.pid),
            "/T",
            "/F",
          ],
          {
            stdout: "ignore",
            stderr: "ignore",
          },
        ).exited;
      } else {
        try {
          process.kill(-child.pid, "SIGTERM");
        } catch {
          /* Already exited. */
        }
      }
    },
    phase === "beta" ? 720_000 : 90_000,
  );
  try {
    const code = await child.exited;
    await Promise.all(readers);
    if (code !== 0 || timedOut || !output.includes(`Native smoke ${phase} passed:`))
      throw new Error(`Native smoke ${phase} did not report successful completion`);
  } finally {
    clearTimeout(timeout);
  }
}
const phase = process.argv[2] ?? process.env.RAYPX_NATIVE_SMOKE_PHASE ?? "shell";
if (
  phase.startsWith("beta") &&
  (!process.env.RAYPX_NATIVE_SMOKE_DATA_DIR || process.env.RAYPX_LIVE_AGENTS !== "1")
)
  throw new Error(
    "Beta smoke requires RAYPX_LIVE_AGENTS=1 and an isolated RAYPX_NATIVE_SMOKE_DATA_DIR",
  );
const directory = phase.startsWith("beta")
  ? resolve(process.env.RAYPX_NATIVE_SMOKE_DATA_DIR!)
  : await mkdtemp(join(tmpdir(), "raypx-native-smoke-"));
const loopbackOrigin = async () => {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response(null) });
  const origin = `http://127.0.0.1:${server.port}`;
  await server.stop(true);
  return origin;
};
async function configure(origin: string) {
  await mkdir(join(directory, "config"), { recursive: true });
  await writeFile(
    join(directory, "config/config.toml"),
    `# Same packaged renderer; choose its server at runtime.\nprofile = "acceptance"\n[profiles.acceptance]\nbase_url = ${JSON.stringify(origin)}\n`,
    { mode: 0o600 },
  );
}
try {
  const api =
    phase === "shell" || phase === "restore"
      ? await loopbackOrigin()
      : process.env.RAYPX_NATIVE_SMOKE_API;
  if (!api) throw new Error("HTTPS native acceptance requires RAYPX_NATIVE_SMOKE_API");
  await configure(api);
  await run(phase, directory);
  if (process.platform === "darwin" && phase === "shell") {
    const status = Bun.spawn(
      [
        resolve(import.meta.dirname, "../../../.hutch/bin/raypx"),
        "daemon",
        "status",
        "--profile",
        "native-smoke",
        "--data-dir",
        directory,
        "--json",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const result = JSON.parse(await new Response(status.stdout).text());
    assert.equal(await status.exited, 0);
    assert.equal(result.running, true, "GUI Quit terminated its independent execution owner");
    console.info("Native smoke daemon preserved after actual GUI Quit");
  }
  if (phase === "shell") {
    let other = await loopbackOrigin();
    while (other === api) other = await loopbackOrigin();
    await configure(other);
    await run("restore", directory);
    await configure(api);
    await run("restore", directory, true);
  }
  if (phase === "write") await run("read", directory);
  if (phase === "beta") await run("beta-restore", directory);
} finally {
  if (process.platform === "darwin") {
    // GUI Quit deliberately preserves its independent owner, including smoke profiles.
    const stop = Bun.spawn(
      [
        process.execPath,
        "run",
        "src/main.ts",
        "daemon",
        "stop",
        "--profile",
        "native-smoke",
        "--data-dir",
        directory,
      ],
      {
        cwd: resolve(import.meta.dirname, "../../../../cli"),
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
      },
    );
    await stop.exited;
  }
  if (!phase.startsWith("beta")) {
    if (process.platform === "win32") {
      const servers = join(directory, "servers");
      for (const entry of await readdir(servers, { withFileTypes: true }).catch(() => [])) {
        if (entry.isDirectory())
          await Bun.secrets.delete({
            service: SESSION_KEY_SERVICE,
            name: sessionKeyName(join(servers, entry.name)),
          });
      }
    }
    await rm(directory, { recursive: true, force: true });
  }
}
