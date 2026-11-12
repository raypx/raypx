import { spawn } from "node:child_process";
import { once } from "node:events";
import { cp, mkdtemp, readdir, readlink, realpath, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

/** A relocated probe must not quietly copy dependencies from outside the artifact. */
export async function stageArtifact(source: string, destination: string) {
  const root = await realpath(source);
  async function validate(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink()) {
        const resolved = await realpath(path);
        const within = relative(root, resolved);
        if (within === ".." || within.startsWith(`..${sep}`) || isAbsolute(within))
          throw new Error(`Artifact link escapes its output: ${relative(root, path)}`);
        if (isAbsolute(await readlink(path)))
          throw new Error(
            `Artifact link must be relative to survive relocation: ${relative(root, path)}`,
          );
      } else if (entry.isDirectory()) await validate(path);
    }
  }
  await validate(root);
  await cp(root, destination, { recursive: true, dereference: false, verbatimSymlinks: true });
}

export interface ArtifactProbe {
  /** Label used in errors and the temporary directory name. */
  name: string;
  /** Output directory, staged as `.output` in a temporary directory. */
  output: string;
  /** Node executable, normally from `pinnedNode`. */
  node: string;
  /** Entry point inside the staged directory. */
  entry?: string;
  /** Path that returns a successful response once the server is ready. */
  healthPath?: string;
  /** Extra environment for the server; HOST and PORT are always set. */
  environment?: (base: string) => Record<string, string>;
  /** Runs against the started server. */
  check: (base: string) => Promise<void>;
  /** Server output that fails the probe even when every check passed. */
  failOnOutput?: readonly string[];
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/** Starts a relocated Node server output on a free port and probes it while it runs. */
export async function probeArtifact({
  name,
  output,
  node,
  entry = ".output/server/index.mjs",
  healthPath = "/health",
  environment = () => ({}),
  check,
  failOnOutput = [],
}: ArtifactProbe): Promise<void> {
  const stage = await mkdtemp(join(tmpdir(), `devkit-${name}-`));
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  let child: ReturnType<typeof spawn> | undefined;
  try {
    await stageArtifact(output, join(stage, ".output"));
    child = spawn(node, [entry], {
      cwd: stage,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), ...environment(base) },
    });
    let logs = "";
    const capture = (chunk: Buffer | string) => {
      logs = `${logs}${chunk.toString()}`.slice(-8000);
    };
    child.stdout?.on("data", capture);
    child.stderr?.on("data", capture);
    let startupError: Error | undefined;
    child.once("error", (error) => {
      startupError = error;
    });
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (startupError) throw startupError;
      if (child.exitCode !== null) throw new Error(`${name} exited during startup: ${logs}`);
      try {
        ready = (await fetch(`${base}${healthPath}`, { signal: AbortSignal.timeout(300) })).ok;
      } catch {
        /* Wait for the listener. */
      }
      if (ready) break;
      await delay(100);
    }
    if (!ready) throw new Error(`${name} startup deadline exceeded: ${logs}`);
    await check(base);
    if (failOnOutput.some((text) => logs.includes(text)))
      throw new Error(`${name} reported a server error: ${logs}`);
  } finally {
    if (child && child.exitCode === null && child.pid) {
      const closed = once(child, "close");
      child.kill("SIGTERM");
      const timer = setTimeout(() => child?.kill("SIGKILL"), 3000);
      timer.unref();
      await closed;
      clearTimeout(timer);
    }
    await rm(stage, { recursive: true, force: true });
  }
}
