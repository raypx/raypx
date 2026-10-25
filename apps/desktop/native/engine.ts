import {
  localEventSchema,
  localResponseSchema,
  type LocalEvent,
  type LocalMethod,
} from "@raypx/contracts/local";
import type { EngineStatus } from "./rpc";

export class LocalEngine {
  status: EngineStatus = { status: "starting" };
  private child: ReturnType<typeof Bun.spawn> | undefined;
  private readonly pending = new Map<
    string,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private generation = 0;
  private starting: Promise<boolean> | undefined;
  constructor(
    private readonly binary: string,
    private readonly version: string,
    private readonly emit: (event: LocalEvent) => void | Promise<void>,
    private readonly args: string[] = [],
    private readonly daemon = false,
  ) {}
  private setStatus(status: EngineStatus) {
    this.status = status;
    void this.emit({ version: 1, event: "engine.status", data: { ...status } });
  }
  start(): Promise<boolean> {
    if (this.starting) return this.starting;
    const starting = this.startOnce();
    this.starting = starting;
    void starting.finally(() => {
      if (this.starting === starting) this.starting = undefined;
    });
    return starting;
  }
  private async startOnce() {
    await this.stop();
    const generation = ++this.generation;
    this.setStatus({ status: "starting" });
    try {
      const child = Bun.spawn(
        [this.binary, ...(this.daemon ? ["daemon", "proxy"] : ["stdio"]), ...this.args],
        {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        },
      );
      this.child = child;
      void this.read(child, generation);
      void (async () => {
        for await (const chunk of child.stderr as ReadableStream<Uint8Array>) {
          console.error("Raypx engine:", new TextDecoder().decode(chunk).slice(-4096));
        }
      })();
      void child.exited.then(() => {
        if (generation !== this.generation) return;
        this.child = undefined;
        if (this.status.code !== "HOST_VERSION_MISMATCH")
          this.fail(new Error("Local engine exited; retry to restart"));
      });
      const info = (await this.request("runtime.info", {})) as {
        version: string;
        protocolVersion: number;
        owner?: string;
      };
      if (
        info.version !== this.version ||
        info.protocolVersion !== 1 ||
        (this.daemon && info.owner !== "daemon")
      )
        throw new Error("Bundled CLI version does not match Desktop");
      this.setStatus({ status: "ready" });
      return true;
    } catch (error) {
      await this.stop();
      this.fail(error instanceof Error ? error : new Error("Local engine could not start"));
      return false;
    }
  }
  private fail(error: Error) {
    this.setStatus({
      status: "error",
      message: error.message,
      ...("code" in error && error.code === "HOST_VERSION_MISMATCH" ? { code: error.code } : {}),
    });
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(error);
    }
    this.pending.clear();
  }
  private async read(child: ReturnType<typeof Bun.spawn>, generation: number) {
    const decoder = new TextDecoder();
    let remaining = "";
    try {
      for await (const chunk of child.stdout as ReadableStream<Uint8Array>) {
        // A retired engine still writes cancellation results while shutting down.
        // Returning cancels the pipe reader and gives that child EPIPE. Drain it
        // to EOF, but never deliver stale events into a new engine generation.
        if (generation !== this.generation) continue;
        remaining += decoder.decode(chunk, { stream: true });
        if (remaining.length > 8 * 1024 * 1024)
          throw new Error("Local engine response exceeds the protocol limit");
        let newline: number;
        while ((newline = remaining.indexOf("\n")) >= 0) {
          const line = remaining.slice(0, newline);
          remaining = remaining.slice(newline + 1);
          if (!line.trim()) continue;
          const value: unknown = JSON.parse(line);
          const event = localEventSchema.safeParse(value);
          if (event.success) {
            if (
              event.data.event === "engine.status" &&
              event.data.data.status === "error" &&
              event.data.data.code === "HOST_VERSION_MISMATCH"
            )
              this.fail(
                Object.assign(
                  new Error("The previous execution owner must be stopped before upgrading"),
                  { code: "HOST_VERSION_MISMATCH" },
                ),
              );
            else if (event.data.event !== "engine.status") await this.emit(event.data);
            continue;
          }
          const response = localResponseSchema.parse(value);
          const pending = this.pending.get(response.id);
          if (!pending) continue;
          clearTimeout(pending.timer);
          this.pending.delete(response.id);
          if ("error" in response)
            pending.reject(new Error(`${response.error.code}: ${response.error.message}`));
          else pending.resolve(response.result);
        }
      }
    } catch (error) {
      if (generation === this.generation) {
        this.fail(error instanceof Error ? error : new Error("Invalid engine output"));
        child.kill();
      }
    }
  }
  request(method: LocalMethod, params: unknown): Promise<unknown> {
    const child = this.child;
    if (!child)
      return Promise.reject(new Error(this.status.message ?? "Local engine is unavailable"));
    if (this.pending.size >= 64)
      return Promise.reject(new Error("Too many pending local operations"));
    const id = crypto.randomUUID();
    const line = JSON.stringify({ version: 1, id, method, params }) + "\n";
    if (Buffer.byteLength(line) > 8 * 1024 * 1024)
      return Promise.reject(new Error("Local request exceeds 8 MiB"));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(id);
          reject(new Error("Local operation timed out"));
        },
        method === "runtime.info" ? 10_000 : 86_410_000,
      );
      this.pending.set(id, { resolve, reject, timer });
      const input = child.stdin as import("bun").FileSink;
      void (async () => {
        await input.write(line);
        await input.flush();
      })().catch((error) => {
        this.fail(error instanceof Error ? error : new Error("Local engine input failed"));
        child.kill();
      });
    });
  }
  async replaceOwner() {
    if (!this.daemon || this.status.code !== "HOST_VERSION_MISMATCH") return false;
    await this.stop();
    const child = Bun.spawn([this.binary, "daemon", "restart", ...this.args], {
      stdin: "ignore",
      stdout: "ignore",
      stderr: "ignore",
    });
    if ((await child.exited) !== 0) {
      this.fail(
        Object.assign(
          new Error("The previous daemon could not be replaced; retry after it stops"),
          { code: "HOST_VERSION_MISMATCH" },
        ),
      );
      return false;
    }
    return this.start();
  }
  async stop() {
    this.generation++;
    const child = this.child;
    this.child = undefined;
    for (const item of this.pending.values()) {
      clearTimeout(item.timer);
      item.reject(new Error("Local engine stopped"));
    }
    this.pending.clear();
    if (!child) return;
    try {
      await (child.stdin as import("bun").FileSink).end();
    } catch {
      /* Already closed. */
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      child.exited,
      new Promise<void>((resolve) => {
        timer = setTimeout(() => {
          child.kill();
          resolve();
        }, 3000);
      }),
    ]);
    if (timer) clearTimeout(timer);
  }
}
