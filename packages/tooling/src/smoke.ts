import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { run } from "./process.js";
import { stageArtifact } from "./artifact.js";
import { pinnedNode } from "./toolchain.js";

/** Starts a relocated Node output on a free port and probes it while it runs. */
async function probeArtifact(
  root: string,
  app: "api" | "web",
  environment: (base: string) => Record<string, string>,
  check: (base: string) => Promise<void>,
): Promise<void> {
  const stage = await mkdtemp(join(tmpdir(), `raypx-${app}-`));
  const port = await new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
  const base = `http://127.0.0.1:${port}`;
  let child: ReturnType<typeof spawn> | undefined;
  try {
    await stageArtifact(join(root, "apps", app, ".output"), join(stage, ".output"));
    const node = pinnedNode(root);
    child = spawn(node, [".output/server/index.mjs"], {
      cwd: stage,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), ...environment(base) },
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
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (startupError) throw startupError;
      if (child.exitCode !== null) throw new Error(`${app} exited during startup: ${output}`);
      try {
        ready = (await fetch(`${base}/health`, { signal: AbortSignal.timeout(300) })).ok;
      } catch {
        /* Wait for listener. */
      }
      if (ready) break;
      await delay(100);
    }
    if (!ready) throw new Error(`${app} startup deadline exceeded: ${output}`);
    await check(base);
    if (output.includes("Error in renderToReadableStream"))
      throw new Error(`${app} reported a server error: ${output}`);
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

export async function probeApi(root: string): Promise<void> {
  await probeArtifact(
    root,
    "api",
    (base) => ({
      NODE_ENV: "test",
      DATABASE_URL: "postgres://raypx:raypx@127.0.0.1:1/raypx_artifact_test",
      AUTH_URL: base,
      AUTH_SECRET: "raypx-artifact-test-secret-32-characters",
      RESEND_API_KEY: "",
      MAIL_FROM: "",
      ALLOWED_ORIGINS: base,
      WEB_URL: base,
    }),
    async (base) => {
      for (const path of [
        "/rpc/__missing",
        "/api/__missing",
        "/settings",
        "/assets/__missing.js",
      ]) {
        const response = await fetch(`${base}${path}`, { headers: { accept: "text/html" } });
        if (response.status !== 404)
          throw new Error(`API ${path} returned ${response.status}, expected 404`);
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
    },
  );
  console.log("Node API artifact probe passed (relocated output, health, 404s, mail guard)");
}

async function probeWeb(root: string): Promise<void> {
  await probeArtifact(
    root,
    "web",
    () => ({ NODE_ENV: "production" }),
    async (base) => {
      // Signed-out requests carry no session cookie, so rendering never calls the API.
      const home = await fetch(base, { headers: { accept: "text/html", "accept-language": "zh" } });
      const html = await home.text();
      if (!home.ok || !html.includes('<html lang="zh"') || !html.includes("<h1>你的账号</h1>"))
        throw new Error("Web did not server-render the account page in the request language");
      const settings = await fetch(`${base}/settings`, {
        headers: { accept: "text/html", cookie: "locale=en; theme=dark" },
      });
      if (!settings.ok || !(await settings.text()).includes("<h1>Make it yours</h1>"))
        throw new Error("Web did not render deep navigation with device preferences");
      const asset = /\/assets\/[^"]+\.js/.exec(html)?.[0];
      if (!asset || !(await fetch(`${base}${asset}`)).ok)
        throw new Error("Web artifact does not serve its client assets");
      for (const path of ["/assets/__missing.js", "/__missing"]) {
        const response = await fetch(`${base}${path}`, { headers: { accept: "text/html" } });
        if (response.status !== 404)
          throw new Error(`Web ${path} returned ${response.status}, expected 404`);
      }
    },
  );
  console.log("Node Web artifact probe passed (relocated output, SSR locale, assets, 404s)");
}

export async function smoke(root: string) {
  await probeApi(root);
  await probeWeb(root);
  await run(
    join(root, "apps/cli/dist", process.platform === "win32" ? "raypx.exe" : "raypx"),
    ["--version"],
    tmpdir(),
  );
  await run(process.execPath, ["run", "smoke"], join(root, "apps/cli"));
}
