import { join, resolve } from "node:path";

const cwd = resolve(import.meta.dirname, "../..");
const children: ReturnType<typeof Bun.spawn>[] = [];
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    try {
      if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
      else
        void Bun.spawn(
          [
            join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
            "/PID",
            String(child.pid),
            "/T",
            "/F",
          ],
          { stdout: "ignore", stderr: "ignore" },
        ).exited;
    } catch {
      /* Already exited. */
    }
  }
}
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
try {
  const vite = Bun.spawn(
    [process.execPath, "--bun", "vp", "dev", "--config", "vite.app.config.ts"],
    {
      cwd,
      stdout: "inherit",
      stderr: "inherit",
      stdin: "ignore",
      detached: process.platform !== "win32",
    },
  );
  children.push(vite);
  const deadline = Date.now() + 30_000;
  while (true) {
    if (vite.exitCode !== null) throw new Error("Desktop renderer development server exited");
    try {
      const response = await fetch("http://localhost:1420", {
        method: "HEAD",
        signal: AbortSignal.timeout(500),
      });
      if (response.ok) break;
    } catch {
      /* Server is still starting. */
    }
    if (stopping) break;
    if (Date.now() > deadline)
      throw new Error("Desktop renderer development server did not become ready");
    await Bun.sleep(100);
  }
  if (!stopping) {
    const native = Bun.spawn(
      [process.execPath, "run", "scripts/native/tauri.ts", "dev", ...process.argv.slice(2)],
      {
        cwd,
        stdout: "inherit",
        stderr: "inherit",
        stdin: "ignore",
        detached: process.platform !== "win32",
      },
    );
    children.push(native);
    process.exitCode = await Promise.race(children.map((child) => child.exited));
  }
} finally {
  stop();
  await Promise.allSettled(children.map((child) => child.exited));
  process.off("SIGINT", stop);
  process.off("SIGTERM", stop);
}
