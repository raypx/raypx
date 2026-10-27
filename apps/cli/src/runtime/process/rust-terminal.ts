import { isAbsolute } from "node:path";
import { stat } from "node:fs/promises";
import type { CommandSpec, LocalEvent } from "@raypx/contracts/local";
import manifest from "../../../package.json";
import { LocalError } from "../errors";

type Child = ReturnType<typeof Bun.spawn>;
type RecordValue = Record<string, unknown>;
type Session = { pending: RecordValue[] | undefined; sequence: number; attachment?: number };
const object = (value: unknown): value is RecordValue =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const integer = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const protocolError = () =>
  new LocalError("TERMINAL_HOST_PROTOCOL", "Invalid terminal host response");

/** Private PTY transport only. Provider protocols and task policy stay in harness. */
export class RustTerminalHost {
  private child: Child | undefined;
  private started: Promise<void> | undefined;
  private reading: Promise<void> | undefined;
  private stopping: Promise<void> | undefined;
  private failure: Error | undefined;
  private closing = false;
  private serial = 0;
  private readonly sessions = new Map<string, Session>();
  private readonly pending = new Map<
    string,
    {
      resolve(value: unknown): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private readonly cancellations = new Set<Promise<unknown>>();

  constructor(
    private readonly binary: string,
    private readonly emit: (event: LocalEvent) => void,
    private readonly args: readonly string[] = [],
  ) {}

  has(id: string) {
    return this.sessions.has(id);
  }
  private start() {
    return (this.started ??= this.startOnce());
  }
  private async startOnce() {
    if (!isAbsolute(this.binary) || !(await stat(this.binary).catch(() => undefined))?.isFile())
      throw new LocalError(
        "TERMINAL_HOST_UNAVAILABLE",
        "Select an absolute terminal host executable",
      );
    if (this.closing) throw new LocalError("CLOSING", "Terminal host is shutting down");
    const child = Bun.spawn([this.binary, ...this.args], {
      stdin: "pipe",
      stdout: "pipe",
      stderr: "ignore",
    });
    this.child = child;
    this.reading = this.read(child).catch(async () => {
      this.fail(protocolError());
      await this.stopChild(child);
    });
    void child.exited.then(async () => {
      await this.reading;
      this.fail(new LocalError("TERMINAL_HOST_EXITED", "Terminal host exited"));
    });
    try {
      const hello = await this.request("hello", {});
      if (!object(hello) || hello.protocol !== 1 || hello.version !== manifest.version)
        throw new LocalError("TERMINAL_HOST_MISMATCH", "Terminal host protocol or version differs");
    } catch (error) {
      // End input first so even a rejected companion can drain its PTYs.
      await this.stopChild(child);
      throw error;
    }
  }
  private async request(method: string, params: RecordValue): Promise<unknown> {
    if (this.failure) throw this.failure;
    const child = this.child;
    if (!child || !child.stdin || typeof child.stdin === "number")
      throw new LocalError("TERMINAL_HOST_EXITED", "Terminal host is not available");
    const input = child.stdin;
    if (this.pending.size >= 64)
      throw new LocalError("TERMINAL_BACKPRESSURE", "Too many pending terminal requests");
    const id = String(++this.serial);
    const wire = JSON.stringify({ version: 1, id, method, params }) + "\n";
    if (Buffer.byteLength(wire) > 256 * 1024)
      throw new LocalError("TOO_LARGE", "Terminal request exceeds the companion limit");
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.fail(new LocalError("TERMINAL_IO_TIMEOUT", "Terminal delivery is uncertain"));
        void this.stopChild(child);
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      void (async () => {
        await input.write(wire);
        await input.flush();
      })().catch(() => {
        this.fail(new LocalError("TERMINAL_HOST_EXITED", "Terminal input is closed"));
        void this.stopChild(child);
      });
    });
  }
  private async read(child: Child) {
    const decoder = new TextDecoder("utf-8", { fatal: true });
    let buffer = "";
    for await (const chunk of child.stdout as ReadableStream<Uint8Array>) {
      buffer += decoder.decode(chunk, { stream: true });
      if (Buffer.byteLength(buffer) > 8 * 1024 * 1024) throw protocolError();
      let end: number;
      while ((end = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (!line) continue;
        const message: unknown = JSON.parse(line);
        if (!object(message) || message.version !== 1) throw protocolError();
        if (typeof message.event === "string") this.event(message);
        else {
          if (typeof message.id !== "string") throw protocolError();
          const pending = this.pending.get(message.id);
          if (!pending) continue; // A timed-out write is never replayed.
          clearTimeout(pending.timer);
          this.pending.delete(message.id);
          if (object(message.error) && typeof message.error.code === "string")
            pending.reject(new LocalError(message.error.code, "Terminal operation failed"));
          else if ("result" in message) pending.resolve(message.result);
          else throw protocolError();
        }
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) throw protocolError();
  }
  private event(message: RecordValue) {
    if (typeof message.id !== "string") throw protocolError();
    const session = this.sessions.get(message.id);
    if (!session) return;
    if (session.pending) {
      if (session.pending.length >= 128) throw protocolError();
      session.pending.push(message);
      return;
    }
    if (message.event === "detached") {
      if (message.attachment === session.attachment) {
        // The existing renderer has no replay/reset handshake. Fail this
        // terminal instead of silently omitting bytes or duplicating history.
        this.cancel(message.id);
        this.finish(message.id, 1);
      }
      return;
    }
    if (!integer(message.sequence)) throw protocolError();
    if (message.sequence <= session.sequence) return;
    if (message.sequence !== session.sequence + 1) throw protocolError();
    session.sequence = message.sequence;
    if (message.event === "output" && typeof message.data === "string")
      this.emit({
        version: 1,
        event: "terminal.output",
        data: { id: message.id, data: message.data },
      });
    else if (message.event === "exit" && integer(message.exitCode))
      this.finish(message.id, message.exitCode);
    else throw protocolError();
  }
  private finish(id: string, exitCode: number) {
    if (!this.sessions.delete(id)) return;
    this.emit({ version: 1, event: "terminal.exit", data: { id, exitCode } });
  }
  private fail(error: Error) {
    this.failure ??= error;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(this.failure);
    }
    this.pending.clear();
    for (const id of this.sessions.keys()) this.finish(id, 1);
  }
  async open(command: CommandSpec, cols: number, rows: number) {
    await this.start();
    if (this.closing) throw new LocalError("CLOSING", "Terminal host is shutting down");
    const result = await this.request("open", {
      executable: command.executable,
      args: command.args,
      cwd: command.cwd,
      cols,
      rows,
    });
    if (!object(result) || typeof result.id !== "string") throw protocolError();
    const id = result.id;
    const session: Session = { pending: [], sequence: 0 };
    this.sessions.set(id, session);
    try {
      const attached = await this.request("attach", { id });
      if (
        !object(attached) ||
        !integer(attached.attachment) ||
        !object(attached.snapshot) ||
        !integer(attached.snapshot.sequence) ||
        !Array.isArray(attached.history)
      )
        throw protocolError();
      session.attachment = attached.attachment;
      for (const chunk of attached.history) {
        if (!object(chunk) || !integer(chunk.sequence) || typeof chunk.data !== "string")
          throw protocolError();
        this.emit({
          version: 1,
          event: "terminal.output",
          data: {
            id,
            data: chunk.data,
            ...(attached.snapshot.historyTruncated ? { truncated: true } : {}),
          },
        });
      }
      session.sequence = attached.snapshot.sequence;
      const buffered = session.pending!;
      session.pending = undefined;
      if (attached.snapshot.status === "exited") {
        if (!integer(attached.snapshot.exitCode)) throw protocolError();
        this.finish(id, attached.snapshot.exitCode);
      } else {
        if (attached.snapshot.status !== "running") throw protocolError();
        for (const event of buffered) this.event(event);
      }
      return { id };
    } catch (error) {
      this.cancel(id);
      this.finish(id, 1);
      throw error;
    }
  }
  async input(id: string, data: string) {
    await this.request("input", { id, data });
    return { accepted: true };
  }
  async resize(id: string, cols: number, rows: number) {
    await this.request("resize", { id, cols, rows });
    return { accepted: true };
  }
  cancel(id: string) {
    if (!this.sessions.has(id)) return { cancelled: false };
    const operation = this.request("close", { id }).catch(() => {
      this.finish(id, 1);
    });
    this.cancellations.add(operation);
    void operation.finally(() => this.cancellations.delete(operation));
    return { cancelled: true };
  }
  private stopChild(child: Child) {
    return (this.stopping ??= this.stopChildOnce(child));
  }
  private async stopChildOnce(child: Child) {
    const deadline = setTimeout(() => child.kill(), 3000);
    try {
      if (child.stdin && typeof child.stdin !== "number") {
        try {
          await child.stdin.end();
        } catch {
          // A disconnected companion may already have closed its input.
        }
      }
      await child.exited;
    } finally {
      clearTimeout(deadline);
    }
  }
  async close() {
    this.closing = true;
    await this.started?.catch(() => {});
    await Promise.allSettled(this.cancellations);
    if (this.child) await this.stopChild(this.child);
    await this.reading;
  }
}
