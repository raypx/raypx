import { AsyncLocalStorage } from "node:async_hooks";
import { spawn } from "node:child_process";

export interface ProcessOptions {
  readonly signal?: AbortSignal;
  readonly onOutput?: (chunk: string, stream: "stdout" | "stderr") => void;
}

const runOptions = new AsyncLocalStorage<ProcessOptions>();

/**
 * Supplies process defaults to one asynchronous operation without changing its
 * environment. Nested scopes inherit defaults; explicit run options take priority.
 */
export function withRunOptions<T>(options: ProcessOptions, operation: () => T): T {
  return runOptions.run({ ...runOptions.getStore(), ...options }, operation);
}

type Failure = { kind: "abort" | "timeout" } | { kind: "error"; error: unknown };

/**
 * Runs a command with an explicit consumer environment and a bounded output tail.
 * Output callbacks receive live chunks without replacing capture. Cancellation and
 * deadlines terminate the POSIX process group, escalating to SIGKILL after 5s;
 * remaining descendants are also cleaned up when their parent exits early.
 */
export async function run(
  command: string,
  args: string[],
  directory: string,
  timeoutMs = 120_000,
  extraEnvironment: NodeJS.ProcessEnv = {},
  options: ProcessOptions = {},
): Promise<string> {
  const { signal: cancellation, onOutput } = { ...runOptions.getStore(), ...options };
  const abortError = (output: string) =>
    new DOMException(`${command} aborted in ${directory}\n${output}`, "AbortError");
  if (cancellation?.aborted) throw abortError("");
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
    let finished = false;
    let closed = false;
    let exit: { code: number | null; signal: NodeJS.Signals | null } | undefined;
    let failure: Failure | undefined;
    let termination: ReturnType<typeof setTimeout> | undefined;
    let polling: ReturnType<typeof setInterval> | undefined;
    let outputCallback = onOutput;

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      clearTimeout(termination);
      clearInterval(polling);
      cancellation?.removeEventListener("abort", onAbort);
      child.stdout.off("data", collectStdout);
      child.stderr.off("data", collectStderr);
      child.off("exit", onExit);
      child.off("close", onClose);
      child.off("error", onError);
      child.stdout.destroy();
      child.stderr.destroy();

      if (failure?.kind === "abort") reject(abortError(output));
      else if (failure?.kind === "timeout")
        reject(new Error(`${command} timed out after ${timeoutMs} ms in ${directory}\n${output}`));
      else if (failure?.kind === "error") reject(failure.error);
      else if (exit?.code !== 0)
        reject(
          new Error(
            `${command} ${args.join(" ")} failed (${exit?.signal ?? exit?.code}) in ${directory}\n${output}`,
          ),
        );
      else accept(output);
    };

    const recordSignalError = (error: unknown) => {
      if (!(error instanceof Error && "code" in error && error.code === "ESRCH"))
        failure ??= { kind: "error", error };
    };
    const signalGroup = (name: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (process.platform === "win32") child.kill(name);
        else process.kill(-child.pid, name);
      } catch (error) {
        recordSignalError(error);
      }
    };

    const groupAlive = () => {
      if (!child.pid) return false;
      if (process.platform === "win32") return !exit;
      try {
        process.kill(-child.pid, 0);
        return true;
      } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ESRCH") return false;
        recordSignalError(error);
        return true;
      }
    };
    const finishIfClean = () => {
      if (closed && !groupAlive()) finish();
    };
    const terminate = () => {
      if (finished || termination) return;
      signalGroup("SIGTERM");
      termination = setTimeout(() => {
        signalGroup("SIGKILL");
        finish();
      }, 5000);
      polling = setInterval(finishIfClean, 25);
      finishIfClean();
    };
    const onAbort = () => {
      failure ??= { kind: "abort" };
      terminate();
    };
    const collect = (chunk: Buffer, stream: "stdout" | "stderr") => {
      const text = chunk.toString();
      output = (output + text).slice(-200_000);
      try {
        outputCallback?.(text, stream);
      } catch (error) {
        outputCallback = undefined;
        failure ??= { kind: "error", error };
        terminate();
      }
    };
    const collectStdout = (chunk: Buffer) => collect(chunk, "stdout");
    const collectStderr = (chunk: Buffer) => collect(chunk, "stderr");
    const onExit = (code: number | null, signal: NodeJS.Signals | null) => {
      exit = { code, signal };
      if (groupAlive()) terminate();
    };
    const onClose = (code: number | null, signal: NodeJS.Signals | null) => {
      exit ??= { code, signal };
      closed = true;
      if (groupAlive()) terminate();
      else finish();
    };
    const onError = (error: Error) => {
      failure ??= { kind: "error", error };
      if (child.pid) terminate();
      else finish();
    };
    const timeout = setTimeout(() => {
      failure ??= { kind: "timeout" };
      terminate();
    }, timeoutMs);
    child.stdout.on("data", collectStdout);
    child.stderr.on("data", collectStderr);
    child.once("exit", onExit);
    child.once("close", onClose);
    child.once("error", onError);
    cancellation?.addEventListener("abort", onAbort, { once: true });
    // Abort can race with spawn and listener registration.
    if (cancellation?.aborted) onAbort();
  });
}
