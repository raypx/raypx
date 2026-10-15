import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { run } from "./process.js";
import { stageArtifact } from "./artifact.js";

export async function probeApi(root: string): Promise<void> {
  const stage = await mkdtemp(join(tmpdir(), "raypx-api-"));
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
  let child: ReturnType<typeof spawn> | undefined;
  try {
    await stageArtifact(join(root, "apps/api/.output"), join(stage, ".output"));
    const node = process.env.RAYPX_NODE_BINARY ?? "node";
    const version = Bun.spawnSync([node, "--version"]);
    if (new TextDecoder().decode(version.stdout).trim() !== "v24.15.0")
      throw new Error("API probe requires Node 24.15.0; select it or set RAYPX_NODE_BINARY");
    child = spawn(node, [".output/server/index.mjs"], {
      cwd: stage,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        NODE_ENV: "test",
        HOST: "127.0.0.1",
        PORT: String(port),
        DATABASE_URL: "postgres://raypx:raypx@127.0.0.1:1/raypx_artifact_test",
        AUTH_URL: `http://127.0.0.1:${port}`,
        AUTH_SECRET: "raypx-artifact-test-secret-32-characters",
        RESEND_API_KEY: "",
        MAIL_FROM: "",
        ALLOWED_ORIGINS: `http://127.0.0.1:${port}`,
        WEB_URL: `http://127.0.0.1:${port}`,
      },
    });
    let output = "";
    child.stdout?.on("data", (chunk) => {
      output = `${output}${chunk}`.slice(-8000);
    });
    child.stderr?.on("data", (chunk) => {
      output = `${output}${chunk}`.slice(-8000);
    });
    let startupError: Error | undefined;
    child.once("error", (error) => {
      startupError = error;
    });
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (startupError) throw startupError;
      if (child.exitCode !== null) throw new Error(`API exited during startup: ${output}`);
      try {
        ready = (await fetch(`${base}/health`, { signal: AbortSignal.timeout(300) })).ok;
      } catch {
        /* Wait for listener. */
      }
      if (ready) break;
      await delay(100);
    }
    if (!ready) throw new Error(`API startup deadline exceeded: ${output}`);
    const home = await fetch(base, { headers: { accept: "text/html" } });
    if (!home.ok || !(await home.text()).includes("<html"))
      throw new Error("API artifact does not include Web static assets");
    const deep = await fetch(`${base}/settings`, { headers: { accept: "text/html" } });
    if (!deep.ok || !(await deep.text()).includes("<html"))
      throw new Error("SPA deep navigation failed");
    for (const path of ["/rpc/__missing", "/api/__missing", "/assets/__missing.js"]) {
      const response = await fetch(`${base}${path}`, { headers: { accept: "text/html" } });
      if (response.status !== 404)
        throw new Error(`${path} returned ${response.status}, expected 404`);
    }
    const signup = await fetch(`${base}/api/auth/sign-up/email`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: base },
      body: JSON.stringify({
        name: "Artifact",
        email: "artifact@example.invalid",
        password: "artifact-password-123",
      }),
    });
    const unavailable = (await signup.json()) as { code?: string };
    if (signup.status !== 503 || unavailable.code !== "MAIL_NOT_CONFIGURED")
      throw new Error(
        "Unconfigured mail must reject signup before any database or delivery attempt",
      );
    console.log(
      "Node API artifact probe passed (relocated output, health, static assets, navigation, 404s)",
    );
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

export async function smoke(root: string) {
  await probeApi(root);
  await run(
    join(root, "apps/cli/dist", process.platform === "win32" ? "raypx.exe" : "raypx"),
    ["--version"],
    tmpdir(),
  );
  await run(process.execPath, ["run", "smoke"], join(root, "apps/cli"));
}
