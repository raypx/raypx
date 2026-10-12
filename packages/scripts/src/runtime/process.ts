import { spawn, type ChildProcess, type StdioOptions } from "node:child_process";

const forwardedSignals = ["SIGINT", "SIGTERM", "SIGHUP"] as const;
const ansiEscapePattern = /\u001B\[[0-?]*[ -\\/]*[@-~]/g;
const failureOutputMaxChars = 8_000;
const failureOutputMaxLines = 80;

export interface ProcessResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stderr: string;
  stdout: string;
}

export interface RunChildProcessOptions {
  captureOutput?: boolean;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  signalSource?: Pick<NodeJS.Process, "off" | "on">;
  stdio?: StdioOptions;
}

export class ProcessError extends Error {
  constructor(
    message: string,
    public readonly command: readonly string[],
    public readonly exitCode: number | null,
    public readonly signal: NodeJS.Signals | null,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ProcessError";
  }
}

function cleanOutput(output: string): string {
  return output.replace(ansiEscapePattern, "").replace(/\r/g, "").trim();
}

export function summarizeProcessOutput(stdout: string, stderr: string): string {
  const output = [cleanOutput(stderr), cleanOutput(stdout)].filter(Boolean).join("\n");
  if (!output) return "";

  const lines = output.split("\n");
  const tail = lines.slice(-failureOutputMaxLines);
  let summary = tail.join("\n");
  if (summary.length > failureOutputMaxChars) {
    summary = summary.slice(-failureOutputMaxChars);
    const firstNewline = summary.indexOf("\n");
    if (firstNewline >= 0) summary = summary.slice(firstNewline + 1);
  }

  const omittedLines = lines.length - tail.length;
  return [
    omittedLines > 0 ? "[" + omittedLines + " earlier output lines omitted]" : undefined,
    summary,
  ]
    .filter(Boolean)
    .join("\n");
}

export function forwardProcessSignals(
  child: Pick<ChildProcess, "exitCode" | "kill" | "signalCode">,
  source: Pick<NodeJS.Process, "off" | "on"> = process,
): () => void {
  const handlers = new Map<NodeJS.Signals, () => void>();

  for (const signal of forwardedSignals) {
    const handler = () => {
      if (child.exitCode === null && child.signalCode === null) child.kill(signal);
    };
    handlers.set(signal, handler);
    source.on(signal, handler);
  }

  return () => {
    for (const [signal, handler] of handlers) source.off(signal, handler);
  };
}

export async function runChildProcess(
  command: readonly string[],
  options: RunChildProcessOptions = {},
): Promise<ProcessResult> {
  const [file, ...args] = command;
  if (!file) throw new ProcessError("Missing child process command.", command, null, null);

  return await new Promise<ProcessResult>((resolve, reject) => {
    const captureOutput = options.captureOutput ?? false;
    const child = spawn(file, args, {
      cwd: options.cwd ?? process.cwd(),
      env: options.env ?? process.env,
      stdio: captureOutput ? ["ignore", "pipe", "pipe"] : (options.stdio ?? "inherit"),
    });
    const stopForwardingSignals = forwardProcessSignals(child, options.signalSource ?? process);
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout?.on("data", (chunk: Buffer | string) => stdout.push(Buffer.from(chunk)));
    child.stderr?.on("data", (chunk: Buffer | string) => stderr.push(Buffer.from(chunk)));

    child.once("error", (error) => {
      stopForwardingSignals();
      reject(
        new ProcessError(`Failed to start ${file}: ${error.message}`, command, null, null, {
          cause: error,
        }),
      );
    });
    child.once("close", (code, signal) => {
      stopForwardingSignals();
      resolve({
        code,
        signal,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
      });
    });
  });
}

export async function runCommand(
  command: readonly string[],
  options: RunChildProcessOptions = {},
): Promise<void> {
  const result = await runChildProcess(command, options);
  if (result.code === 0 && result.signal === null) return;

  const status = result.signal ?? result.code ?? "unknown";
  const output = options.captureOutput ? summarizeProcessOutput(result.stdout, result.stderr) : "";
  throw new ProcessError(
    [(command[0] ?? "command") + " exited with " + status, output ? "\n" + output : undefined]
      .filter(Boolean)
      .join(""),
    command,
    result.code,
    result.signal,
  );
}
