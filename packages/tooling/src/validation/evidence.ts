import { spawn } from "node:child_process";
import { closeSync, openSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface ValidationProcess {
  exited: Promise<number>;
  alive: () => boolean;
  stop: () => Promise<void>;
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
  start(label: string, args: string[], env = process.env, cwd = this.root): ValidationProcess {
    this.check();
    if (!/^[\w-]+$/.test(label) || !args[0]) throw new Error("Invalid validation command");
    const fd = openSync(join(this.directory, `${label}.log`), "w", 0o600);
    const started = performance.now();
    const child = (() => {
      try {
        return spawn(args[0], args.slice(1), {
          cwd,
          env,
          detached: process.platform !== "win32",
          stdio: ["ignore", fd, fd],
        });
      } finally {
        closeSync(fd);
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
  async command(label: string, args: string[], env = process.env) {
    const code = await this.start(label, args, env).exited;
    this.check();
    console.log(`${label}: ${code === 0 ? "passed" : "failed"}`);
    if (code)
      throw new Error(`${label} failed (${code}); see ${join(this.directory, `${label}.log`)}`);
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
