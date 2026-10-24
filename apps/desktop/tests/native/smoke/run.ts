import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const { packageManager } = await Bun.file(
  resolve(import.meta.dirname, "../../../../../package.json"),
).json();

async function run(phase: string, directory: string) {
  const child = Bun.spawn([process.execPath, "--bun", "electrobun", "dev"], {
    cwd: resolve(import.meta.dirname, "../../.."),
    env: {
      ...process.env,
      RAYPX_NATIVE_SMOKE: "1",
      RAYPX_NATIVE_SMOKE_PHASE: phase,
      RAYPX_NATIVE_SMOKE_DATA_DIR: directory,
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
try {
  await run(phase, directory);
  if (phase === "shell") await run("restore", directory);
  if (phase === "write") await run("read", directory);
  if (phase === "beta") await run("beta-restore", directory);
} finally {
  if (!phase.startsWith("beta")) await rm(directory, { recursive: true, force: true });
}
