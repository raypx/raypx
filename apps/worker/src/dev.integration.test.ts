import { spawn, execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";

const execute = promisify(execFile);
const require = createRequire(import.meta.url);
const script = fileURLToPath(new URL("../scripts/dev.mjs", import.meta.url));
interface HostEvent {
  kind: "start" | "stop" | "exit" | "check";
  version: string;
  pid: number;
  flags: string[];
}

const source = (version: string) => `import { appendFileSync } from "node:fs";
const version = ${JSON.stringify(version)};
const record = (kind) => appendFileSync(process.env.WORKER_DEV_EVENTS, JSON.stringify({
  kind, version, pid: process.pid, flags: process.argv.slice(2),
}) + "\\n");
if (!process.env.WORKER_DEV_CHECK_HOLD && (process.argv.includes("--check") || process.argv.includes("--check-documents"))) {
  record("check");
} else {
  record("start");
  const interval = setInterval(() => {}, 1000);
  process.once("SIGTERM", () => {
    record("stop");
    setTimeout(() => {
      clearInterval(interval);
      record("exit");
      process.exit(0);
    }, 100);
  });
}
`;

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), "raypx-worker-dev-"));
  const eventsFile = join(directory, "events.jsonl");
  await mkdir(join(directory, "scripts"));
  await mkdir(join(directory, "src"));
  await mkdir(join(directory, "node_modules"));
  await cp(script, join(directory, "scripts/dev.mjs"));
  for (const name of ["nitro", "vite", "vite-plus"]) {
    const manifest = require.resolve(`${name}/package.json`);
    await symlink(dirname(manifest), join(directory, "node_modules", name), "dir");
  }
  await writeFile(
    join(directory, "package.json"),
    JSON.stringify({ name: "worker-dev-fixture", private: true, type: "module" }),
  );
  await writeFile(
    join(directory, "vite.config.ts"),
    `import { nitro } from "nitro/vite";
import { defineConfig } from "vite-plus";
export default defineConfig({ plugins: nitro({
  preset: "bun", entry: "./src/main.ts", serverDir: false, serverEntry: false, noPublicDir: true,
  rolldownConfig: {
    input: { index: ${JSON.stringify(join(directory, "src/main.ts"))}, runner: ${JSON.stringify(join(directory, "src/runner-main.ts"))} },
    output: { entryFileNames: "[name].mjs", chunkFileNames: "[name]-[hash].mjs" },
  },
}) });
`,
  );
  await writeFile(join(directory, "src/main.ts"), source("first"));
  await writeFile(join(directory, "src/runner-main.ts"), 'console.log("runner fixture");\n');
  const events = async (): Promise<HostEvent[]> => {
    const text = await readFile(eventsFile, "utf8").catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return "";
      throw error;
    });
    return text.trim()
      ? text
          .trim()
          .split("\n")
          .map((line) => JSON.parse(line) as HostEvent)
      : [];
  };
  return { directory, eventsFile, events };
}

async function waitFor<T>(read: () => Promise<T>, matches: (value: T) => boolean): Promise<T> {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (matches(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Worker development fixture did not reach the expected state.");
}

async function deadline<T>(pending: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("Development shutdown timed out.")), 10_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

describe("Vite and Nitro Worker development host", () => {
  it.each(["SIGINT", "SIGTERM"] as const)(
    "restarts successful bundles, waits for old hosts and closes on %s",
    async (signal) => {
      const setup = await fixture();
      let output = "";
      const dev = spawn(process.execPath, [join(setup.directory, "scripts/dev.mjs")], {
        cwd: setup.directory,
        env: { ...process.env, WORKER_DEV_EVENTS: setup.eventsFile },
        stdio: ["ignore", "pipe", "pipe"],
      });
      dev.stdout.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      dev.stderr.on("data", (chunk: Buffer) => {
        output += chunk.toString();
      });
      const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
        (resolve, reject) => {
          dev.on("error", reject);
          dev.on("close", (code, signal) => resolve({ code, signal }));
        },
      );
      try {
        await waitFor(setup.events, (events) => events.some((event) => event.kind === "start"));
        await writeFile(join(setup.directory, "src/main.ts"), source("second"));
        const restarted = await waitFor(setup.events, (events) =>
          events.some((event) => event.kind === "start" && event.version === "second"),
        );
        expect(restarted.map(({ kind, version }) => `${kind}:${version}`)).toEqual([
          "start:first",
          "stop:first",
          "exit:first",
          "start:second",
        ]);
        const current = restarted.at(-1)!;
        await writeFile(join(setup.directory, "src/main.ts"), "export const =;\n");
        await waitFor(
          async () => output,
          (text) => text.includes("Worker build failed; keeping the current host running."),
        );
        expect(await setup.events()).toEqual(restarted);
        expect(() => process.kill(current.pid, 0)).not.toThrow();
        dev.kill(signal);
        await waitFor(setup.events, (events) =>
          events.some((event) => event.kind === "stop" && event.version === "second"),
        );
        dev.kill(signal);
        const exited = await deadline(closed);
        expect(exited).toEqual({ code: 0, signal: null });
        expect((await setup.events()).map(({ kind, version }) => `${kind}:${version}`)).toEqual([
          "start:first",
          "stop:first",
          "exit:first",
          "start:second",
          "stop:second",
          "exit:second",
        ]);
        expect(() => process.kill(current.pid, 0)).toThrow();
      } catch (error) {
        throw new Error(`${error instanceof Error ? error.message : error}\n${output}`, {
          cause: error,
        });
      } finally {
        if (dev.exitCode === null && dev.signalCode === null) dev.kill("SIGKILL");
        for (const event of await setup.events()) {
          try {
            process.kill(event.pid, "SIGKILL");
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
          }
        }
        await closed;
        await rm(setup.directory, { recursive: true, force: true });
      }
    },
    45_000,
  );

  it.each(["--check", "--check-documents"])(
    "runs %s against the compiled host without watching",
    async (flag) => {
      const setup = await fixture();
      try {
        await execute(process.execPath, [join(setup.directory, "scripts/dev.mjs"), flag], {
          cwd: setup.directory,
          env: { ...process.env, WORKER_DEV_EVENTS: setup.eventsFile },
          timeout: 20_000,
        });
        const events = await setup.events();
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ kind: "check", flags: [flag] });
      } finally {
        await rm(setup.directory, { recursive: true, force: true });
      }
    },
    25_000,
  );
  it("stops a smoke host that is still running when SIGTERM arrives", async () => {
    const setup = await fixture();
    const dev = spawn(process.execPath, [join(setup.directory, "scripts/dev.mjs"), "--check"], {
      cwd: setup.directory,
      env: { ...process.env, WORKER_DEV_EVENTS: setup.eventsFile, WORKER_DEV_CHECK_HOLD: "1" },
      stdio: "ignore",
    });
    const closed = new Promise<number | null>((resolve, reject) => {
      dev.on("error", reject);
      dev.on("close", (code) => resolve(code));
    });
    try {
      await waitFor(setup.events, (events) => events.some((event) => event.kind === "start"));
      dev.kill("SIGTERM");
      expect(await deadline(closed)).toBe(0);
      expect((await setup.events()).map(({ kind }) => kind)).toEqual(["start", "stop", "exit"]);
    } finally {
      if (dev.exitCode === null && dev.signalCode === null) dev.kill("SIGKILL");
      for (const event of await setup.events()) {
        try {
          process.kill(event.pid, "SIGKILL");
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
        }
      }
      await closed;
      await rm(setup.directory, { recursive: true, force: true });
    }
  }, 25_000);
});
