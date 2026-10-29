import { isAbsolute, join } from "node:path";
import { stat } from "node:fs/promises";
import type { CommandSpec, LocalEvent, ToolResult } from "@raypx/contracts/local";
import { LocalError } from "../errors";
import type { Environment } from "./bun";
import { HerdrTerminalHost } from "./herdr";
import { resolveHerdrBinary } from "./herdr-release";

const MAX_OUTPUT = 1024 * 1024;
type Child = ReturnType<typeof Bun.spawn>;
export class ProcessRuntime {
  private readonly children = new Map<string, { child: Child; cancel: () => void }>();
  private readonly completions = new Set<Promise<unknown>>();
  private closing = false;
  private herdr: HerdrTerminalHost | undefined;
  private terminalStarting: Promise<HerdrTerminalHost> | undefined;
  constructor(
    private readonly emit: (event: LocalEvent) => void,
    private readonly terminalHost = process.env.RAYPX_HERDR_BINARY,
    private readonly environment: () => Environment = () => process.env,
    private readonly directory = join(process.cwd(), ".raypx"),
  ) {}
  async validate(command: CommandSpec) {
    if (!isAbsolute(command.executable) || !isAbsolute(command.cwd))
      throw new LocalError(
        "ABSOLUTE_PATH_REQUIRED",
        "Executable and working directory must be absolute paths",
      );
    if (!(await stat(command.executable)).isFile() || !(await stat(command.cwd)).isDirectory())
      throw new LocalError("INVALID_COMMAND", "Executable or working directory does not exist");
  }
  private kill(child: Child) {
    if (process.platform === "win32") {
      // taskkill /T is the Windows process-tree operation; no shell interpolation.
      const killer = Bun.spawn(
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
      );
      void killer.exited;
    } else {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        try {
          child.kill("SIGTERM");
        } catch {
          /* Already exited. */
        }
      }
      const timeout = setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {
          try {
            child.kill("SIGKILL");
          } catch {
            /* Already exited. */
          }
        }
      }, 500);
      timeout.unref();
    }
  }
  async run(command: CommandSpec, signal?: AbortSignal, requestedId?: string): Promise<ToolResult> {
    if (this.closing) throw new LocalError("CLOSING", "Local engine is shutting down");
    await this.validate(command);
    if (this.closing) throw new LocalError("CLOSING", "Local engine is shutting down");
    signal?.throwIfAborted();
    const id = requestedId ?? crypto.randomUUID();
    if (this.children.has(id))
      throw new LocalError("DUPLICATE_ID", "A command with this ID is already running");
    let cancelled = false;
    const child = Bun.spawn([command.executable, ...command.args], {
      cwd: command.cwd,
      env: this.environment(),
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      detached: process.platform !== "win32",
    });
    const cancel = () => {
      cancelled = true;
      this.kill(child);
    };
    this.children.set(id, { child, cancel });
    const timeout = setTimeout(cancel, command.timeoutMs);
    signal?.addEventListener("abort", cancel, { once: true });
    let retained = 0;
    const chunks: Buffer[] = [];
    const drain = async (stream: ReadableStream<Uint8Array>) => {
      for await (const chunk of stream) {
        if (retained >= MAX_OUTPUT) continue;
        const accepted = Buffer.from(chunk).subarray(0, MAX_OUTPUT - retained);
        retained += accepted.length;
        chunks.push(accepted);
      }
    };
    const completion = (async () => {
      try {
        await Promise.all([
          drain(child.stdout as ReadableStream<Uint8Array>),
          drain(child.stderr as ReadableStream<Uint8Array>),
        ]);
        const exitCode = await child.exited;
        const result = { id, exitCode, output: Buffer.concat(chunks).toString("utf8"), cancelled };
        this.emit({ version: 1, event: "tool.finished", data: result });
        return result;
      } finally {
        clearTimeout(timeout);
        signal?.removeEventListener("abort", cancel);
        this.children.delete(id);
      }
    })();
    this.completions.add(completion);
    try {
      return await completion;
    } finally {
      this.completions.delete(completion);
    }
  }
  async terminal(command: CommandSpec, cols: number, rows: number) {
    if (this.closing) throw new LocalError("CLOSING", "Local engine is shutting down");
    await this.validate(command);
    if (this.closing) throw new LocalError("CLOSING", "Local engine is shutting down");
    const host = await (this.terminalStarting ??= resolveHerdrBinary(
      this.directory,
      this.terminalHost,
    ).then((binary) => (this.herdr = new HerdrTerminalHost(binary, this.emit, this.environment))));
    if (this.closing) throw new LocalError("CLOSING", "Local engine is shutting down");
    return host.open(command, cols, rows);
  }
  input(id: string, data: string) {
    if (Buffer.byteLength(data, "base64") > 64 * 1024)
      throw new LocalError("TOO_LARGE", "Terminal input is limited to 64 KiB");
    if (!this.herdr) throw new LocalError("TERMINAL_NOT_FOUND", "Terminal is closed");
    return this.herdr.input(id, data);
  }
  resize(id: string, cols: number, rows: number) {
    if (!this.herdr) throw new LocalError("TERMINAL_NOT_FOUND", "Terminal is closed");
    return this.herdr.resize(id, cols, rows);
  }
  paste(id: string, text: string) {
    if (!this.herdr) throw new LocalError("TERMINAL_NOT_FOUND", "Terminal is closed");
    return this.herdr.paste(id, text);
  }
  key(id: string, key: string) {
    if (!this.herdr) throw new LocalError("TERMINAL_NOT_FOUND", "Terminal is closed");
    return this.herdr.key(id, key);
  }
  mouse(id: string, event: Parameters<HerdrTerminalHost["mouse"]>[1]) {
    if (!this.herdr) throw new LocalError("TERMINAL_NOT_FOUND", "Terminal is closed");
    return this.herdr.mouse(id, event);
  }
  scroll(id: string, direction: "up" | "down", lines: number) {
    if (!this.herdr) throw new LocalError("TERMINAL_NOT_FOUND", "Terminal is closed");
    return this.herdr.scroll(id, direction, lines);
  }
  cancel(id: string) {
    if (this.herdr?.has(id)) return this.herdr.cancel(id);
    const item = this.children.get(id);
    if (!item) return { cancelled: false };
    item.cancel();
    return { cancelled: true };
  }
  async close() {
    this.closing = true;
    for (const item of this.children.values()) item.cancel();
    await this.terminalStarting?.catch(() => {});
    await this.herdr?.close();
    await Promise.allSettled(this.completions);
  }
}
