import { spawn } from "node:child_process";

export async function run(
  command: string,
  args: string[],
  directory: string,
  timeoutMs = 120_000,
  extraEnvironment: NodeJS.ProcessEnv = {},
): Promise<string> {
  if (command === "bun" && !args.includes("--no-env-file")) args = ["--no-env-file", ...args];
  return new Promise((accept, reject) => {
    const child = spawn(command, args, {
      cwd: directory,
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        SystemRoot: process.env.SystemRoot,
        NODE_ENV: "test",
        CI: process.env.CI,
        ...extraEnvironment,
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let output = "";
    const collect = (chunk: Buffer) => {
      output = (output + chunk.toString()).slice(-200_000);
    };
    child.stdout.on("data", collect);
    child.stderr.on("data", collect);
    let finished = false;
    let timedOut = false;
    let termination: ReturnType<typeof setTimeout> | undefined;
    const signal = (name: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (process.platform === "win32") child.kill(name);
        else process.kill(-child.pid, name);
      } catch (error) {
        if (!(error instanceof Error && "code" in error && error.code === "ESRCH")) reject(error);
      }
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      signal("SIGTERM");
      termination = setTimeout(() => {
        signal("SIGKILL");
        child.stdout.destroy();
        child.stderr.destroy();
        if (!finished) {
          finished = true;
          reject(
            new Error(`${command} timed out after ${timeoutMs} ms in ${directory}\n${output}`),
          );
        }
      }, 5000);
    }, timeoutMs);
    child.once("error", (error) => {
      clearTimeout(timeout);
      clearTimeout(termination);
      finished = true;
      reject(error);
    });
    child.once("close", (code, exitSignal) => {
      clearTimeout(timeout);
      clearTimeout(termination);
      if (finished) return;
      finished = true;
      if (timedOut) signal("SIGKILL");
      if (timedOut || code !== 0)
        reject(
          new Error(
            timedOut
              ? `${command} timed out after ${timeoutMs} ms in ${directory}\n${output}`
              : `${command} ${args.join(" ")} failed (${exitSignal ?? code}) in ${directory}\n${output}`,
          ),
        );
      else accept(output);
    });
  });
}
