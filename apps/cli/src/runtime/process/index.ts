import { isAbsolute, join } from "node:path";
import { stat } from "node:fs/promises";
import type { CommandSpec, LocalEvent, ToolResult } from "@raypx/contracts/local";
import { LocalError } from "../errors";

const MAX_OUTPUT = 1024 * 1024;
type Child = ReturnType<typeof Bun.spawn>;
export class ProcessRuntime {
  private readonly children = new Map<
    string,
    { child: Child; terminal?: Bun.Terminal; cancel: () => void }
  >();
  private readonly completions = new Set<Promise<unknown>>();
  private closing = false;
  constructor(private readonly emit: (event: LocalEvent) => void) {}
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
    const id = crypto.randomUUID();
    const terminal = new Bun.Terminal({
      cols,
      rows,
      data: (_terminal, data) => {
        if (data.length > MAX_OUTPUT) {
          this.emit({
            version: 1,
            event: "terminal.output",
            data: {
              id,
              data: Buffer.from(data.subarray(0, MAX_OUTPUT)).toString("base64"),
              truncated: true,
            },
          });
          this.cancel(id);
          return;
        }
        this.emit({
          version: 1,
          event: "terminal.output",
          data: { id, data: Buffer.from(data).toString("base64") },
        });
      },
    });
    const child = Bun.spawn([command.executable, ...command.args], {
      cwd: command.cwd,
      terminal,
      detached: process.platform !== "win32",
    });
    this.children.set(id, { child, terminal, cancel: () => this.kill(child) });
    const completion = child.exited.then((exitCode) => {
      this.children.delete(id);
      terminal.close();
      this.emit({ version: 1, event: "terminal.exit", data: { id, exitCode } });
    });
    this.completions.add(completion);
    void completion.finally(() => this.completions.delete(completion));
    return { id };
  }
  input(id: string, data: string) {
    const terminal = this.children.get(id)?.terminal;
    if (!terminal) throw new LocalError("TERMINAL_NOT_FOUND", "Terminal is closed");
    if (Buffer.byteLength(data, "base64") > 64 * 1024)
      throw new LocalError("TOO_LARGE", "Terminal input is limited to 64 KiB");
    terminal.write(Buffer.from(data, "base64"));
    return { accepted: true };
  }
  resize(id: string, cols: number, rows: number) {
    const terminal = this.children.get(id)?.terminal;
    if (!terminal) throw new LocalError("TERMINAL_NOT_FOUND", "Terminal is closed");
    terminal.resize(cols, rows);
    return { accepted: true };
  }
  cancel(id: string) {
    const item = this.children.get(id);
    if (!item) return { cancelled: false };
    item.cancel();
    return { cancelled: true };
  }
  async close() {
    this.closing = true;
    for (const item of this.children.values()) item.cancel();
    await Promise.allSettled(this.completions);
  }
}
