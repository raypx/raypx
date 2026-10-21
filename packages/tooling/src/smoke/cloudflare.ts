import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createTestHarness, experimental_readRawConfig } from "wrangler";
import { stageArtifact } from "@raypx-kit/devkit/artifact";

const root = resolve(process.argv[2] ?? ".");
const serveApi = process.argv.includes("--serve-api");
const workerProbeHeader = "x-raypx-worker-probe";

async function start(app: "api" | "web") {
  const stage = await mkdtemp(join(tmpdir(), `raypx-${app}-worker-`));
  const output = join(stage, ".output-cloudflare");
  let server: ReturnType<typeof createTestHarness> | undefined;
  try {
    await stageArtifact(join(root, "apps", app, ".output-cloudflare"), output);
    const main = join(output, "server", app === "web" ? "probe.mjs" : "index.mjs");
    if (app === "web") {
      // Mark Worker responses only in this disposable copy to observe asset routing.
      await writeFile(
        main,
        `import worker from "./index.mjs";
export default {
  ...worker,
  async fetch(request, env, ctx) {
    const response = await worker.fetch(request, env, ctx);
    const marked = new Response(response.body, response);
    marked.headers.set(${JSON.stringify(workerProbeHeader)}, "1");
    return marked;
  }
};
`,
      );
    }
    const { rawConfig } = experimental_readRawConfig({
      config: join(root, "apps", app, "wrangler.jsonc"),
    });
    // No development dotenv files or live service bindings enter an artifact probe.
    const { env: _env, build: _build, hyperdrive: _hyperdrive, ...config } = rawConfig;
    const database = serveApi ? process.env.TEST_DATABASE_URL : undefined;
    if (serveApi && (!database || !new URL(database).pathname.endsWith("_test")))
      throw new Error("TEST_DATABASE_URL must name an isolated *_test database");
    server = createTestHarness({
      root: stage,
      workers: [
        {
          config: {
            ...config,
            main,
            ...(config.assets
              ? { assets: { ...config.assets, directory: join(output, "public") } }
              : {}),
            ...(app === "api"
              ? {
                  vars: {
                    NODE_ENV: "test",
                    DATABASE_URL:
                      database ?? "postgres://raypx:raypx@127.0.0.1:1/raypx_artifact_test",
                    AUTH_URL: "http://localhost:3002",
                    AUTH_SECRET: "raypx-artifact-test-secret-32-characters",
                    ALLOWED_ORIGINS: "http://localhost:3000",
                    RESEND_API_KEY: "",
                    MAIL_FROM: "",
                  },
                }
              : { vars: { NODE_ENV: "production" } }),
            ...(serveApi && process.env.TEST_DATABASE_MODE === "hyperdrive"
              ? {
                  hyperdrive: [
                    {
                      binding: "HYPERDRIVE",
                      id: "00000000000000000000000000000000",
                      localConnectionString: database!,
                    },
                  ],
                }
              : {}),
          },
        },
      ],
    });
    const { url } = await server.listen();
    return {
      server,
      base: url.origin,
      close: async () => {
        try {
          await server!.close();
        } finally {
          await rm(stage, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    await server?.close().catch(() => {});
    await rm(stage, { recursive: true, force: true });
    throw error;
  }
}

async function probeApi(base: string) {
  const health = await probeFetch(`${base}/health`);
  if (!health.ok || ((await health.json()) as { status?: string }).status !== "ok")
    throw new Error("Worker API health failed");
  for (const path of ["/rpc/__missing", "/api/__missing", "/settings", "/assets/__missing.js"]) {
    if ((await probeFetch(`${base}${path}`)).status !== 404)
      throw new Error(`Worker API ${path} must be 404`);
  }
  const signup = await probeFetch(`${base}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  if (
    signup.status !== 503 ||
    ((await signup.json()) as { code?: string }).code !== "MAIL_NOT_CONFIGURED"
  )
    throw new Error("Worker API must reject unavailable mail before touching the database");
  const account = await probeFetch(`${base}/rpc/account/get`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ json: {} }),
  });
  if (account.status !== 401 || !account.headers.get("x-request-id"))
    throw new Error("Worker API must reject a missing session with a request identifier");
  const concurrent = await Promise.all(
    Array.from({ length: 6 }, () => probeFetch(`${base}/health`)),
  );
  if (concurrent.some((response) => !response.ok))
    throw new Error("Worker API concurrent lifecycle failed");
}

async function probeWeb(base: string) {
  const home = await probeFetch(base, { redirect: "manual" });
  if (home.headers.get(workerProbeHeader) !== "1" || !isSignInRedirect(home))
    throw new Error("Worker Web sign-in redirect failed");
  const login = await probeFetch(`${base}/login`, { headers: { "accept-language": "zh" } });
  const html = await login.text();
  if (
    !login.ok ||
    login.headers.get(workerProbeHeader) !== "1" ||
    !html.includes('<html lang="zh"') ||
    !html.includes("欢迎回来</h2>")
  )
    throw new Error("Worker Web SSR locale failed");
  const reset = await probeFetch(`${base}/forgot-password`, {
    headers: { cookie: "locale=en; theme=dark" },
  });
  if (
    !reset.ok ||
    reset.headers.get(workerProbeHeader) !== "1" ||
    !(await reset.text()).includes("Reset password</h2>")
  )
    throw new Error("Worker Web preferences failed");
  const health = await probeFetch(`${base}/health`);
  if (
    !health.ok ||
    health.headers.get(workerProbeHeader) !== "1" ||
    ((await health.json()) as { status?: string }).status !== "ok"
  )
    throw new Error("Worker Web health route failed");
  for (const [asset, contentType] of [
    [/\/assets\/[^" ]+\.js/.exec(html)?.[0], "javascript"],
    [/\/assets\/[^" ]+\.css/.exec(html)?.[0], "text/css"],
    ["/favicon.png", "image/png"],
  ] as const) {
    if (!asset) throw new Error(`Worker Web HTML must reference ${contentType} assets`);
    const response = await probeFetch(`${base}${asset}`);
    if (
      !response.ok ||
      response.headers.has(workerProbeHeader) ||
      !response.headers.get("content-type")?.includes(contentType)
    )
      throw new Error(`Worker Web ${asset} must be served directly by Assets`);
    if (
      asset.startsWith("/assets/") &&
      !response.headers.get("cache-control")?.includes("immutable")
    )
      throw new Error(`Worker Web ${asset} must retain immutable caching`);
  }
  for (const path of ["/assets/__missing.js", "/__missing"]) {
    const response = await probeFetch(`${base}${path}`);
    if (response.status !== 404)
      throw new Error(`Worker Web ${path} must be 404, received ${response.status}`);
    if (path === "/__missing" && response.headers.get(workerProbeHeader) !== "1")
      throw new Error("Worker Web unknown page routes must reach the Worker");
  }
}

/** The signed-in surface answers signed-out visitors with a redirect to /login. */
function isSignInRedirect(response: Response): boolean {
  const location = response.headers.get("location") ?? "";
  return response.status >= 300 && response.status < 400 && /\/login(?:$|\?)/.test(location);
}

function probeFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(10000) });
}

if (serveApi) {
  const worker = await start("api");
  process.stdout.write(`${JSON.stringify({ type: "raypx-worker-ready", url: worker.base })}\n`);
  await new Promise<void>((done) => {
    for (const signal of ["SIGTERM", "SIGINT"] as const) process.once(signal, done);
  });
  await worker.close();
} else {
  for (const app of ["api", "web"] as const) {
    const worker = await start(app);
    try {
      await (app === "api" ? probeApi(worker.base) : probeWeb(worker.base));
      if (worker.server.getLogs().some((log) => log.level === "error"))
        throw new Error(`Worker ${app} reported a runtime error`);
      console.log(`Cloudflare ${app} artifact probe passed (relocated output, workerd runtime)`);
    } finally {
      await worker.close();
    }
  }
}
