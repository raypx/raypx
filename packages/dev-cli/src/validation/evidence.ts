import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface ValidationProcess {
  exited: Promise<number>;
  alive: () => boolean;
  stop: () => Promise<void>;
}

type CommandOutput = "log" | "inherit";

function validLabel(label: string) {
  return label.length > 0 && label.length <= 128 && !/[^\w-]/.test(label);
}

/** Own subprocesses and generated evidence; never serialize argv or environment. */
export class Evidence {
  readonly id = `${new Date().toISOString().replaceAll(/[:.]/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;
  readonly directory: string;
  private children: ValidationProcess[] = [];
  private results: { label: string; code: number; durationMs: number }[] = [];
  private interrupted = false;

  constructor(
    readonly root: string,
    kind: string,
  ) {
    this.directory = join(root, ".artifacts", kind, this.id);
  }
  check() {
    if (this.interrupted) throw new Error("Validation interrupted");
  }
  start(
    label: string,
    args: string[],
    env = process.env,
    cwd = this.root,
    output: CommandOutput = "log",
  ): ValidationProcess {
    this.check();
    if (!validLabel(label) || !args[0]) throw new Error("Invalid validation command");
    const fd =
      output === "log" ? openSync(join(this.directory, `${label}.log`), "w", 0o600) : undefined;
    const started = performance.now();
    const child = (() => {
      try {
        return spawn(args[0], args.slice(1), {
          cwd,
          env,
          detached: process.platform !== "win32",
          stdio: ["ignore", fd ?? "inherit", fd ?? "inherit"],
        });
      } finally {
        if (fd !== undefined) closeSync(fd);
      }
    })();
    let active = true;
    const exited = new Promise<number>((resolve) => {
      const finish = (code: number) => {
        if (!active) return;
        active = false;
        this.results.push({ label, code, durationMs: performance.now() - started });
        resolve(code);
      };
      child.once("error", () => finish(127));
      child.once("exit", (code) => finish(code ?? 128));
    });
    const kill = (signal: NodeJS.Signals) => {
      if (!active) return;
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, signal);
        else child.kill(signal);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
      }
    };
    const value = {
      exited,
      alive: () => active,
      async stop() {
        if (!active) return;
        kill("SIGTERM");
        const timer = setTimeout(() => kill("SIGKILL"), 5000);
        try {
          await exited;
        } finally {
          clearTimeout(timer);
        }
      },
    };
    this.children.push(value);
    return value;
  }
  async measure<T>(label: string, operation: () => Promise<T>): Promise<T> {
    if (!validLabel(label)) throw new Error("Invalid validation label");
    const started = performance.now();
    let code = 0;
    try {
      return await operation();
    } catch (error) {
      code = 1;
      throw error;
    } finally {
      const durationMs = performance.now() - started;
      this.results.push({ label, code, durationMs });
      console.log(`${label}: ${code === 0 ? "passed" : "failed"} (${Math.round(durationMs)} ms)`);
    }
  }
  async command(label: string, args: string[], env = process.env, output: CommandOutput = "log") {
    const started = performance.now();
    const code = await this.start(label, args, env, this.root, output).exited;
    this.check();
    console.log(
      `${label}: ${code === 0 ? "passed" : "failed"} (${Math.round(performance.now() - started)} ms)`,
    );
    if (code) {
      const log = output === "log" ? join(this.directory, `${label}.log`) : "CI job log";
      throw new Error(`${label} failed (${code}); see ${log}`);
    }
  }
  async stopAll() {
    const results = await Promise.allSettled(this.children.map((child) => child.stop()));
    if (results.some((result) => result.status === "rejected"))
      throw new Error("Unable to stop an owned validation process");
  }
  async run(body: (evidence: Evidence) => Promise<void>) {
    await mkdir(this.directory, { recursive: true });
    const interrupt = () => {
      this.interrupted = true;
      void this.stopAll().catch(() => {});
    };
    process.on("SIGINT", interrupt);
    process.on("SIGTERM", interrupt);
    try {
      await body(this);
      this.check();
    } finally {
      try {
        await this.stopAll();
      } finally {
        process.off("SIGINT", interrupt);
        process.off("SIGTERM", interrupt);
        await writeFile(
          join(this.directory, "commands.json"),
          JSON.stringify(this.results, null, 2),
        );
      }
    }
    console.log(`Evidence: ${this.directory}`);
  }
}
