import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { healthResponseSchema } from "@raypx/contracts/health";
import { afterAll, beforeAll, expect, test } from "vite-plus/test";

let server: ChildProcess;
let baseUrl: string;

beforeAll(async () => {
  const reservation = createServer();
  reservation.listen(0, "127.0.0.1");
  await once(reservation, "listening");
  const address = reservation.address();
  if (!address || typeof address === "string") throw new Error("No test port available");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  );
  baseUrl = `http://127.0.0.1:${port}`;
  server = spawn("bun", ["--no-env-file", ".output/server/index.mjs"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), NODE_ENV: "production" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  let startupError: Error | undefined;
  server.once("error", (error) => {
    startupError = error;
  });
  server.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  server.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (startupError)
      throw new Error("Bun production server could not start", { cause: startupError });
    if (server.exitCode !== null) throw new Error(`Production server exited: ${output}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {
      /* Wait for the listener to become available. */
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Production server did not become ready: ${output}`);
}, 15_000);

afterAll(async () => {
  if (!server?.pid || server.exitCode !== null) return;
  const exited = once(server, "exit");
  server.kill("SIGTERM");
  const timeout = setTimeout(() => server.kill("SIGKILL"), 5000);
  try {
    await exited;
  } finally {
    clearTimeout(timeout);
  }
});

test("production targets Bun while Vitest runs on Node", async () => {
  expect(process.versions.bun).toBeUndefined();
  const build = JSON.parse(
    await readFile(new URL("../.output/nitro.json", import.meta.url), "utf8"),
  ) as { preset: unknown; serverEntry: unknown; commands: { preview: unknown } };

  expect(build.preset).toBe("bun");
  expect(build.serverEntry).toBe("server/index.mjs");
  expect(build.commands.preview).toMatch(/^bun /);
});

test("production serves SSR HTML and its browser assets", async () => {
  const response = await fetch(baseUrl);
  expect(response.status).toBe(200);
  const html = await response.text();
  expect(html).toContain("Project ready, start building from here.");
  expect(html).toContain('lang="en"');
  expect(html).toContain("Connecting to backend");
  const scripts = [...html.matchAll(/src="([^"]+\.js)"/g)];
  expect(scripts.length).toBeGreaterThan(0);
  for (const [, src] of scripts) {
    if (!src) throw new Error("Missing script source");
    const asset = await fetch(new URL(src, baseUrl));
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toContain("javascript");
  }
  const stylesheets = [...html.matchAll(/href="([^"]+\.css)"/g)];
  expect(stylesheets.length).toBeGreaterThan(0);
  for (const [, href] of stylesheets) {
    if (!href) throw new Error("Missing stylesheet source");
    const asset = await fetch(new URL(href, baseUrl));
    expect(asset.status).toBe(200);
    expect(asset.headers.get("content-type")).toContain("text/css");
    expect(await asset.text()).toContain("button");
  }
});

test("production routes health and unknown API requests correctly", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  expect(response.status).toBe(200);
  expect(healthResponseSchema.parse(await response.json()).status).toBe("ok");
  for (const path of ["/api", "/api/missing", "/api/missing/deeper"]) {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const missing = await fetch(`${baseUrl}${path}`, { method });
      expect(missing.status).toBe(404);
      expect(await missing.json()).toEqual({ error: "Not found" });
    }
  }
});

test("production returns a page 404 for an unknown page", async () => {
  const response = await fetch(`${baseUrl}/missing-page`);
  expect(response.status).toBe(404);
  expect(await response.text()).toContain("Page Not Found");
});
