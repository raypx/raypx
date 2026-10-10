import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { apiErrorResponseSchema } from "@raypx/contracts/errors";
import { healthResponseSchema, readinessResponseSchema } from "@raypx/contracts/health";
import { afterAll, beforeAll, expect, test, vi } from "vite-plus/test";

let server: ChildProcess;
let baseUrl: string;
let serverOutput = "";
const appVersion = "p0-production-version-sentinel";
const observedRequestIds: string[] = [];

function productionEnvironment(overrides: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOST: "127.0.0.1",
    PORT: "3000",
    NODE_ENV: "production",
    LOG_LEVEL: "info",
    APP_VERSION: appVersion,
    ...overrides,
  };
}

function logRecords(): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  for (const line of serverOutput.split("\n")) {
    try {
      const value: unknown = JSON.parse(line);
      if (value !== null && typeof value === "object" && !Array.isArray(value))
        records.push(value as Record<string, unknown>);
    } catch {
      // Bun/Nitro also print startup messages that are not JSON access records.
    }
  }
  return records;
}

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
    env: productionEnvironment({ PORT: String(port) }),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let startupError: Error | undefined;
  server.once("error", (error) => {
    startupError = error;
  });
  server.stdout?.on("data", (chunk: Buffer) => {
    serverOutput += chunk.toString();
  });
  server.stderr?.on("data", (chunk: Buffer) => {
    serverOutput += chunk.toString();
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (startupError)
      throw new Error("Bun production server could not start", { cause: startupError });
    if (server.exitCode !== null) throw new Error(`Production server exited: ${serverOutput}`);
    try {
      const response = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(500) });
      if (response.ok) return;
    } catch {
      /* Wait for the listener to become available. */
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Production server did not become ready: ${serverOutput}`);
}, 15_000);

afterAll(async () => {
  if (!server?.pid || server.exitCode !== null) return;
  const closed = once(server, "close");
  server.kill("SIGTERM");
  const timeout = setTimeout(() => server.kill("SIGKILL"), 5000);
  try {
    await closed;
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

test("production records one ready event and one terminal event for a real SSR body", async () => {
  const requestId = "production-ssr-lifecycle";
  const response = await fetch(baseUrl, { headers: { "x-request-id": requestId } });
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("Project ready, start building from here.");
  await vi.waitFor(() => {
    const ready = logRecords().filter(
      (record) => record.requestId === requestId && record.phase === "response-ready",
    );
    const finished = logRecords().filter(
      (record) => record.requestId === requestId && record.phase === "response-finished",
    );
    expect(ready).toHaveLength(1);
    expect(finished).toEqual([
      expect.objectContaining({ outcome: "complete", status: 200, route: "/" }),
    ]);
    expect(Number(finished[0]!.durationMs)).toBeGreaterThanOrEqual(Number(ready[0]!.durationMs));
  });
});

test("production routes health and unknown API requests correctly", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  expect(response.status).toBe(200);
  expect(healthResponseSchema.parse(await response.json()).status).toBe("ok");
  for (const path of ["/api", "/api/missing", "/api/missing/deeper"]) {
    for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) {
      const missing = await fetch(`${baseUrl}${path}`, { method });
      expect(missing.status).toBe(404);
      const payload = apiErrorResponseSchema.parse(await missing.json());
      expect(payload.error).toMatchObject({ code: "NOT_FOUND", message: "Not found" });
      expect(payload.error.requestId).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
      expect(missing.headers.get("x-request-id")).toBe(payload.error.requestId);
    }
  }
});

test("production returns a page 404 for an unknown page", async () => {
  const response = await fetch(`${baseUrl}/missing-page`);
  expect(response.status).toBe(404);
  expect(await response.text()).toContain("Page Not Found");
});

test("production readiness reports initialized runtime without connecting unused services", async () => {
  const response = await fetch(`${baseUrl}/api/ready`);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-request-id")).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
  expect(readinessResponseSchema.parse(await response.json())).toEqual({
    status: "ok",
    service: "raypx-api",
    checks: {},
  });
});

test.each(["/", "/api/health", "/api/ready", "/api/missing"])(
  "production carries an incoming request ID through %s",
  async (path) => {
    const requestId = `p0-correlation-${crypto.randomUUID()}`;
    observedRequestIds.push(requestId);
    const response = await fetch(`${baseUrl}${path}`, { headers: { "x-request-id": requestId } });
    expect(response.headers.get("x-request-id")).toBe(requestId);
    expect(response.status).toBe(path === "/api/missing" ? 404 : 200);
    const body = await response.text();
    let errorRequestId: string | undefined;
    if (path === "/api/missing") {
      const payload: unknown = JSON.parse(body);
      errorRequestId = apiErrorResponseSchema.parse(payload).error.requestId;
    }
    expect(errorRequestId).toBe(path === "/api/missing" ? requestId : undefined);
    await vi.waitFor(() => {
      const records = logRecords().filter(
        (record) => record.requestId === requestId && record.message === "Request completed",
      );
      expect(records).toHaveLength(1);
      expect(records).toContainEqual(
        expect.objectContaining({
          message: "Request completed",
          requestId,
          method: "GET",
          path,
          status: response.status,
        }),
      );
    });
  },
);

test.each(["invalid/request/id", "x".repeat(129)])(
  "production replaces invalid request ID %s",
  async (incomingId) => {
    const response = await fetch(`${baseUrl}/api/missing`, {
      headers: { "x-request-id": incomingId },
    });
    expect(response.status).toBe(404);
    const requestId = response.headers.get("x-request-id");
    expect(requestId).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
    expect(requestId).not.toBe(incomingId);
    expect(apiErrorResponseSchema.parse(await response.json()).error.requestId).toBe(requestId);
    if (requestId) observedRequestIds.push(requestId);
  },
);

test("production access logs contain request context and duration without query secrets", async () => {
  const requestId = `p0-access-${crypto.randomUUID()}`;
  observedRequestIds.push(requestId);
  const secret = "p0-querysecret-value-must-not-appear";
  const response = await fetch(`${baseUrl}/api/health?querysecret=${secret}`, {
    headers: { "x-request-id": requestId },
  });
  expect(response.status).toBe(200);
  await response.text();
  await vi.waitFor(() => {
    const records = logRecords().filter(
      (entry) => entry.requestId === requestId && entry.message === "Request completed",
    );
    expect(records).toHaveLength(1);
    const record = records[0];
    expect(record).toMatchObject({
      requestId,
      method: "GET",
      path: "/api/health",
      status: 200,
      version: appVersion,
    });
    expect(record?.durationMs).toBeTypeOf("number");
    expect(record?.durationMs).toBeGreaterThanOrEqual(0);
  });
  expect(serverOutput).not.toContain("querysecret");
  expect(serverOutput).not.toContain(secret);
});

test("production uses the supplied listen port and application version at runtime", async () => {
  expect(new URL(baseUrl).port).not.toBe("");
  await vi.waitFor(() => {
    expect(logRecords()).toContainEqual(
      expect.objectContaining({ message: "Runtime initialized", version: appVersion }),
    );
  });
});

test.each(["PORT", "NITRO_PORT"])(
  "direct production startup rejects invalid %s before listening without exposing its value",
  async (field) => {
    const processUnderTest = spawn("bun", ["--no-env-file", ".output/server/index.mjs"], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: productionEnvironment({ [field]: "abc" }),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    processUnderTest.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    processUnderTest.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    const deadline = setTimeout(() => processUnderTest.kill("SIGKILL"), 5000);
    try {
      const [code, signal] = (await once(processUnderTest, "exit")) as [
        number | null,
        NodeJS.Signals | null,
      ];
      expect(signal).toBeNull();
      expect(code).toBeTypeOf("number");
      expect(code).not.toBe(0);
      expect(output).toContain("Invalid server environment");
      expect(output).toContain(`${field}:`);
      expect(output).not.toContain("abc");
    } finally {
      clearTimeout(deadline);
      if (processUnderTest.exitCode === null && processUnderTest.signalCode === null)
        processUnderTest.kill("SIGKILL");
    }
  },
  10_000,
);

test("production emits exactly one access record for each correlated request", () => {
  expect(observedRequestIds.length).toBeGreaterThan(0);
  for (const requestId of observedRequestIds) {
    expect(
      logRecords().filter(
        (record) => record.requestId === requestId && record.message === "Request completed",
      ),
    ).toHaveLength(1);
  }
});
