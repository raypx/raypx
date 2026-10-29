import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { herdrRequest, record } from "./herdr-ipc";
import { removeHerdrDirectory } from "./herdr-cleanup";

/** Private subprocess entrypoints, never registered as public CLI commands. */
export async function herdrInternal(args: string[]) {
  if (args[0] === "server" && args.length === 4) {
    const [, binary, socket, owner] = args;
    const directory = process.cwd();
    const child = Bun.spawn([binary!, "server"], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
      windowsHide: true,
    });
    try {
      await Promise.race([
        child.exited,
        (async () => {
          for await (const _chunk of Bun.stdin.stream()) {
            /* EOF owns shutdown. */
          }
        })(),
      ]);
    } finally {
      const deadline = setTimeout(() => {
        if (process.platform === "win32") {
          const killer = Bun.spawn(
            [
              join(process.env.SystemRoot ?? "C:\\Windows", "System32/taskkill.exe"),
              "/PID",
              String(child.pid),
              "/T",
              "/F",
            ],
            { stdout: "ignore", stderr: "ignore" },
          );
          void killer.exited;
        } else child.kill("SIGKILL");
      }, 8000);
      try {
        if (process.platform === "win32" && child.exitCode === null) {
          // Kill the private server tree while its root still exists. Otherwise
          // ConPTY helpers can outlive the server and retain its cwd handle.
          const killer = Bun.spawn(
            [
              join(process.env.SystemRoot ?? "C:\\Windows", "System32/taskkill.exe"),
              "/PID",
              String(child.pid),
              "/T",
              "/F",
            ],
            { stdout: "ignore", stderr: "ignore", windowsHide: true },
          );
          await killer.exited;
        } else await herdrRequest(socket!, "server.stop").catch(() => {});
        await child.exited;
      } finally {
        clearTimeout(deadline);
        if (
          basename(directory).startsWith("rxh-") &&
          (await Bun.file(join(directory, "raypx-owner"))
            .text()
            .catch(() => null)) === owner
        ) {
          process.chdir(tmpdir());
          await removeHerdrDirectory(directory);
        }
      }
    }
    return;
  }
  if (args[0] === "child" && args.length === 4) {
    const [, port, token, id] = args;
    const endpoint = `http://127.0.0.1:${Number(port)}`;
    const headers = { authorization: `Bearer ${token}` };
    const response = await fetch(`${endpoint}/command/${id}`, {
      headers,
      proxy: false,
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error("Terminal command is unavailable");
    const spec: unknown = await response.json();
    if (
      !record(spec) ||
      !record(spec.command) ||
      !record(spec.env) ||
      typeof spec.marker !== "string"
    )
      throw new Error("Invalid terminal command");
    const command = spec.command as { executable: string; args: string[]; cwd: string };
    const marker = spec.marker;
    const env = spec.env as Record<string, string>;
    for (const key of [
      "HERDR_ENV",
      "HERDR_WORKSPACE_ID",
      "HERDR_TAB_ID",
      "HERDR_PANE_ID",
      "HERDR_SOCKET_PATH",
    ])
      if (process.env[key] !== undefined) env[key] = process.env[key]!;
    let exitCode = 1;
    try {
      const child = Bun.spawn([command.executable, ...command.args], {
        cwd: command.cwd,
        env,
        stdin: "inherit",
        stdout: "inherit",
        stderr: "inherit",
      });
      exitCode = await child.exited;
    } catch {
      /* A spawn failure still has an authoritative terminal exit. */
    }
    // A title marker is a VT parsing barrier. The host captures a final full
    // frame only after Ghostty has processed every preceding child output byte.
    await new Promise<void>((resolve) =>
      process.stdout.write(`\x1b]0;${marker}\x07`, () => resolve()),
    );
    await fetch(`${endpoint}/exit/${id}`, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      proxy: false,
      redirect: "error",
      body: JSON.stringify({ exitCode }),
      signal: AbortSignal.timeout(15_000),
    }).catch(() => {});
    process.exitCode = exitCode;
    return;
  }
  throw new Error("Invalid private terminal invocation");
}
