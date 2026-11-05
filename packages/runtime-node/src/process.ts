import crossSpawn from "cross-spawn";
const { spawn, sync: spawnSync } = crossSpawn;
import { accessSync, constants } from "node:fs";
import { delimiter, isAbsolute, join, resolve } from "node:path";
import { Readable } from "node:stream";
import { once } from "node:events";
import { constants as osConstants } from "node:os";
export { setTimeout as sleep } from "node:timers/promises";

export function findExecutable(command: string): string | null {
  const extensions =
    process.platform === "win32" ? (process.env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";") : [""];
  const directories =
    isAbsolute(command) || /[/\\]/.test(command) ? [""] : (process.env.PATH ?? "").split(delimiter);
  for (const directory of directories) {
    const base = directory ? join(directory, command) : resolve(command);
    for (const suffix of [
      "",
      ...extensions.filter((value) => !base.toLowerCase().endsWith(value.toLowerCase())),
    ]) {
      try {
        accessSync(base + suffix, process.platform === "win32" ? constants.F_OK : constants.X_OK);
        return base + suffix;
      } catch {
        /* Next candidate. */
      }
    }
  }
  return null;
}

type Input = "pipe" | "ignore" | "inherit";
export interface ProcessOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  stdin?: Input | Uint8Array;
  stdout?: Input;
  stderr?: Input;
  detached?: boolean;
  windowsHide?: boolean;
  signal?: AbortSignal;
  timeout?: number;
}

/** A subprocess with bounded, backpressure-aware Web Stream output. */
type Output<O, K extends string> =
  O extends Record<K, "ignore" | "inherit"> ? null : ReadableStream<Uint8Array>;
type InputSink = {
  write(value: string | Uint8Array): number;
  flush(): Promise<void>;
  end(value?: string | Uint8Array): void;
};
export function spawnProcess<O extends ProcessOptions = {}>(
  command: string[],
  options: O = {} as O,
) {
  if (!command[0]) throw new Error("An executable is required");
  const input = options.stdin;
  const child = spawn(command[0], command.slice(1), {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: [
      input instanceof Uint8Array ? "pipe" : (input ?? "pipe"),
      options.stdout ?? "pipe",
      options.stderr ?? "pipe",
    ],
    detached: options.detached ?? false,
    windowsHide: options.windowsHide ?? true,
    ...(options.signal ? { signal: options.signal } : {}),
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
  });
  const exited = new Promise<number>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) =>
      resolveExit(code ?? (signal ? 128 + (osConstants.signals[signal] ?? 0) : 1)),
    );
  });
  // Owners attach a completion handler after installing their stream readers.
  void exited.catch(() => {});
  child.stdin?.on("error", () => {});
  if (input instanceof Uint8Array) child.stdin?.end(input);
  const stdin = child.stdin
    ? {
        write(value: string | Uint8Array) {
          child.stdin!.write(value);
          return Buffer.byteLength(value);
        },
        async flush() {
          if (child.stdin!.writableNeedDrain && !child.stdin!.destroyed)
            await once(child.stdin!, "drain");
        },
        end(value?: string | Uint8Array) {
          child.stdin!.end(value);
        },
      }
    : null;
  return {
    get pid() {
      return child.pid ?? 0;
    },
    stdin: stdin as O extends { stdin: "ignore" | "inherit" | Uint8Array } ? null : InputSink,
    stdout: (child.stdout ? Readable.toWeb(child.stdout) : null) as Output<O, "stdout">,
    stderr: (child.stderr ? Readable.toWeb(child.stderr) : null) as Output<O, "stderr">,
    exited,
    get exitCode() {
      return child.exitCode;
    },
    get signalCode() {
      return child.signalCode;
    },
    get killed() {
      return child.killed;
    },
    kill(signal: NodeJS.Signals | number = "SIGTERM") {
      return child.kill(signal);
    },
    unref() {
      child.unref();
    },
    ref() {
      child.ref();
    },
  };
}

/** Runs a command with inherited streams and forwards interrupts until it exits. */
export async function runProcess(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const child = spawnProcess([command, ...args], {
    cwd,
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const interrupt = () => child.kill("SIGINT");
  const terminate = () => child.kill("SIGTERM");
  process.once("SIGINT", interrupt);
  process.once("SIGTERM", terminate);
  try {
    return await child.exited;
  } finally {
    process.off("SIGINT", interrupt);
    process.off("SIGTERM", terminate);
  }
}

/** Runs an inherited-stream command, rejecting unsuccessful exits. */
export async function run(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
) {
  const code = await runProcess(command, args, cwd, env);
  if (code !== 0) throw new Error(`${command} exited ${code}`);
}

export function runProcessSync(
  command: string[] | ({ cmd: string[] } & ProcessOptions),
  supplied: ProcessOptions = {},
) {
  const options = Array.isArray(command) ? supplied : command;
  const argv = Array.isArray(command) ? command : command.cmd;
  if (!argv[0]) throw new Error("An executable is required");
  const input = options.stdin;
  const result = spawnSync(argv[0], argv.slice(1), {
    cwd: options.cwd,
    env: options.env ?? process.env,
    stdio: [
      input instanceof Uint8Array ? "pipe" : (input ?? "pipe"),
      options.stdout ?? "pipe",
      options.stderr ?? "pipe",
    ],
    ...(input instanceof Uint8Array ? { input } : {}),
    windowsHide: options.windowsHide ?? true,
    maxBuffer: 32 * 1024 * 1024,
    ...(options.timeout === undefined ? {} : { timeout: options.timeout }),
  });
  if (result.error) throw result.error;
  return {
    stdout: result.stdout ?? Buffer.alloc(0),
    stderr: result.stderr ?? Buffer.alloc(0),
    exitCode: result.status ?? 1,
    success: result.status === 0,
  };
}

export async function readStandardInput() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}
export const standardInputStream = () =>
  Readable.toWeb(process.stdin) as unknown as ReadableStream<Uint8Array>;
