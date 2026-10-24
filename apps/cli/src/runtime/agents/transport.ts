import { join } from "node:path";
import { LocalError } from "../errors";

export class JsonProcess {
  readonly child: ReturnType<typeof Bun.spawn>;
  private termination: Promise<void> | undefined;
  private serial = 0;
  private readonly pending = new Map<
    string,
    {
      resolve(value: Record<string, unknown>): void;
      reject(error: Error): void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  readonly completed: Promise<number>;
  constructor(
    executable: string,
    args: string[],
    cwd: string,
    onMessage: (value: Record<string, unknown>) => void,
    env?: Record<string, string | undefined>,
  ) {
    this.child = Bun.spawn([executable, ...args], {
      cwd,
      env: env ?? process.env,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
      detached: process.platform !== "win32",
    });
    const child = this.child;
    this.completed = (async () => {
      // stderr is drained, but never forwarded into diagnostics or cloud records.
      const stderr = (async () => {
        for await (const _chunk of child.stderr as ReadableStream<Uint8Array>) {
          /* drain */
        }
      })();
      try {
        const decoder = new TextDecoder();
        let buffer = "";
        for await (const chunk of child.stdout as ReadableStream<Uint8Array>) {
          buffer += decoder.decode(chunk, { stream: true });
          if (Buffer.byteLength(buffer) > 2 * 1024 * 1024)
            throw new LocalError("AGENT_PROTOCOL_LIMIT", "Agent record exceeds limit");
          let offset: number;
          while ((offset = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, offset);
            buffer = buffer.slice(offset + 1);
            if (!line.trim()) continue;
            const value: unknown = JSON.parse(line);
            if (!value || typeof value !== "object" || Array.isArray(value))
              throw new LocalError("AGENT_PROTOCOL", "Invalid agent record");
            const message = value as Record<string, unknown>;
            const control =
              message.type === "control_response" &&
              message.response &&
              typeof message.response === "object"
                ? (message.response as Record<string, unknown>)
                : undefined;
            const id = control ? String(control.request_id) : String(message.id);
            const pending = this.pending.get(id);
            if (pending && (control || "result" in message || "error" in message)) {
              clearTimeout(pending.timer);
              this.pending.delete(id);
              if (control?.subtype === "error" || "error" in message)
                pending.reject(new LocalError("AGENT_RPC_FAILED", "Agent request failed"));
              else
                pending.resolve(
                  (control?.response ?? message.result ?? {}) as Record<string, unknown>,
                );
            } else onMessage(message);
          }
        }
        if (buffer.trim()) throw new LocalError("AGENT_PROTOCOL", "Incomplete agent record");
        const exit = await child.exited;
        await stderr;
        return exit;
      } catch (error) {
        await this.kill();
        await stderr;
        throw error;
      } finally {
        for (const item of this.pending.values()) {
          clearTimeout(item.timer);
          item.reject(new LocalError("AGENT_EXITED", "Agent exited"));
        }
        this.pending.clear();
      }
    })();
    // Callers attach their own completion handler after startup.
    void this.completed.catch(() => {});
  }
  send(value: unknown) {
    const input = this.child.stdin;
    if (!input || typeof input === "number")
      throw new LocalError("AGENT_EXITED", "Agent input is closed");
    void input.write(JSON.stringify(value) + "\n");
    void input.flush();
  }
  request(method: string, params: unknown) {
    const id = String(++this.serial);
    return this.exchange(id, { id, method, params });
  }
  control(request: Record<string, unknown>) {
    const id = `control:${++this.serial}`;
    return this.exchange(id, { type: "control_request", request_id: id, request });
  }
  private exchange(id: string, message: unknown) {
    return new Promise<Record<string, unknown>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new LocalError("AGENT_TIMEOUT", "Agent handshake timed out"));
      }, 15_000);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.send(message);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  kill() {
    return (this.termination ??= this.terminate());
  }
  private async terminate() {
    if (process.platform === "win32") {
      try {
        const code = await Bun.spawn(
          [
            join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe"),
            "/PID",
            String(this.child.pid),
            "/T",
            "/F",
          ],
          { stdout: "ignore", stderr: "ignore" },
        ).exited;
        if (code !== 0) this.child.kill("SIGKILL");
      } catch {
        this.child.kill("SIGKILL");
      }
    } else {
      const signal = (value: NodeJS.Signals | 0) => {
        try {
          process.kill(-this.child.pid, value);
          return true;
        } catch {
          return false;
        }
      };
      signal("SIGTERM");
      const deadline = Date.now() + 500;
      // The parent can exit before tools that ignore SIGTERM. Keep the project
      // locked through their grace period, even when they closed inherited pipes.
      while (signal(0) && Date.now() < deadline) {
        await Bun.sleep(10);
      }
      signal("SIGKILL");
    }
    await this.child.exited;
  }
}
