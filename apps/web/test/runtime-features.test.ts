import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createDatabase, runMigrations } from "@raypx/db";
import { session } from "@raypx/db/schema";
import { sessionResponseSchema, currentUserResponseSchema } from "@raypx/contracts/auth";
import { apiErrorResponseSchema } from "@raypx/contracts/errors";
import { afterAll, beforeAll, expect, test } from "vite-plus/test";

const origin = "https://raypx.test";
const token = "metrics-integration-token-".repeat(2);
let directory: string;
let databasePath: string;
let processUnderTest: ChildProcess;
let baseURL: string;
let output = "";

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), "raypx-foundations-"));
  databasePath = join(directory, "auth.db");
  const connection = createDatabase(databasePath);
  try {
    runMigrations(connection.db);
  } finally {
    connection.close();
  }
  const portReservation = createServer();
  portReservation.listen(0, "127.0.0.1");
  await once(portReservation, "listening");
  const address = portReservation.address();
  if (!address || typeof address === "string") throw new Error("No port available");
  const port = address.port;
  await new Promise<void>((resolve, reject) =>
    portReservation.close((error) => (error ? reject(error) : resolve())),
  );
  baseURL = `http://127.0.0.1:${port}`;
  processUnderTest = spawn("bun", ["--no-env-file", ".output/server/index.mjs"], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: {
      PATH: process.env.PATH,
      HOST: "127.0.0.1",
      PORT: String(port),
      NODE_ENV: "production",
      LOG_LEVEL: "info",
      AUTH_ENABLED: "true",
      DATABASE_PATH: databasePath,
      BETTER_AUTH_URL: origin,
      BETTER_AUTH_SECRET: "auth-integration-secret-".repeat(2),
      METRICS_ENABLED: "true",
      METRICS_TOKEN: token,
      API_RATE_LIMIT_MAX: "12",
      API_RATE_LIMIT_WINDOW_MS: "60000",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  processUnderTest.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  processUnderTest.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (processUnderTest.exitCode !== null) throw new Error(`Feature server failed: ${output}`);
    try {
      if ((await fetch(`${baseURL}/api/health`, { signal: AbortSignal.timeout(500) })).ok) return;
    } catch {
      /* Wait for the listener. */
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error("Feature server did not start");
}, 15_000);

afterAll(async () => {
  if (processUnderTest?.pid && processUnderTest.exitCode === null) {
    const closed = once(processUnderTest, "close");
    processUnderTest.kill("SIGTERM");
    const timeout = setTimeout(() => processUnderTest.kill("SIGKILL"), 3000);
    try {
      await closed;
    } finally {
      clearTimeout(timeout);
    }
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("authentication, safe account projection, revocation, metrics and rate protection work in the built server", async () => {
  const anonymous = await fetch(`${baseURL}/api/session`);
  expect(sessionResponseSchema.parse(await anonymous.json())).toEqual({ user: null });
  const denied = await fetch(`${baseURL}/api/me`);
  expect(denied.status).toBe(401);
  expect(apiErrorResponseSchema.parse(await denied.json()).error.code).toBe("UNAUTHORIZED");
  const crossSite = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { origin: "https://attacker.test", "content-type": "application/json" },
    body: JSON.stringify({
      name: "Alice",
      email: "alice@example.com",
      password: "a-valid-test-password",
    }),
  });
  expect(crossSite.status).toBe(403);
  const signup = await fetch(`${baseURL}/api/auth/sign-up/email`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({
      name: "Alice",
      email: "alice@example.com",
      password: "a-valid-test-password",
    }),
  });
  expect(signup.status).toBe(200);
  const cookies = signup.headers.getSetCookie();
  expect(cookies.join(";")).toContain("HttpOnly");
  expect(cookies.join(";")).toContain("Secure");
  const cookie = cookies.map((entry) => entry.split(";", 1)[0]).join("; ");
  expect(cookie).not.toBe("");
  const account = await fetch(`${baseURL}/api/me`, { headers: { cookie } });
  expect(account.status).toBe(200);
  const payload: unknown = await account.json();
  expect(currentUserResponseSchema.parse(payload).user.email).toBe("alice@example.com");
  expect(JSON.stringify(payload)).not.toContain("token");
  expect(JSON.stringify(payload)).not.toContain("password");
  const connection = createDatabase(databasePath);
  try {
    connection.db
      .update(session)
      .set({
        updatedAt: new Date(Date.now() - 2 * 86_400_000),
        expiresAt: new Date(Date.now() + 86_400_000),
      })
      .run();
  } finally {
    connection.close();
  }
  const refreshed = await fetch(`${baseURL}/api/session`, { headers: { cookie } });
  expect(refreshed.status).toBe(200);
  expect(refreshed.headers.getSetCookie().join(";")).toContain("HttpOnly");
  const logout = await fetch(`${baseURL}/api/auth/sign-out`, {
    method: "POST",
    headers: { cookie, origin, "content-type": "application/json" },
    body: "{}",
  });
  expect(logout.status).toBe(200);
  expect((await fetch(`${baseURL}/api/me`, { headers: { cookie } })).status).toBe(401);
  const signin = await fetch(`${baseURL}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email: "alice@example.com", password: "a-valid-test-password" }),
  });
  expect(signin.status).toBe(200);
  const readiness = await fetch(`${baseURL}/api/ready`);
  expect(await readiness.json()).toMatchObject({ status: "ok", checks: { database: "ok" } });
  expect((await fetch(`${baseURL}/api/metrics`)).status).toBe(401);
  const sentinel = "query-private-sentinel";
  await fetch(`${baseURL}/api/arbitrary-user-id?token=${sentinel}`, {
    headers: { "x-request-id": sentinel },
  });
  const scraped = await fetch(`${baseURL}/api/metrics`, {
    headers: { authorization: `Bearer ${token}` },
  });
  expect(scraped.status).toBe(200);
  expect(scraped.headers.get("cache-control")).toBe("no-store");
  const metrics = await scraped.text();
  expect(metrics).toContain(
    'raypx_http_requests_total{route="/api/auth/*",method="POST",status="200"} 3',
  );
  expect(metrics).toContain('route="unmatched"');
  expect(metrics).not.toContain("arbitrary-user-id");
  expect(metrics).not.toContain(sentinel);
  expect(metrics).not.toContain(token);
  let blocked: Response | undefined;
  for (let index = 0; index < 15; index++) {
    const response = await fetch(`${baseURL}/api/session`, {
      headers: { "x-forwarded-for": `198.51.100.${index}` },
    });
    if (response.status === 429) {
      blocked = response;
      break;
    }
  }
  if (!blocked) throw new Error("Expected rate limit to block requests");
  expect(blocked.headers.get("retry-after")).toMatch(/^\d+$/);
  const error = apiErrorResponseSchema.parse(await blocked.json());
  expect(error.error.code).toBe("RATE_LIMITED");
  expect(error.error.requestId).toBe(blocked.headers.get("x-request-id"));
  expect((await fetch(`${baseURL}/api/health`)).status).toBe(200);
  expect((await fetch(`${baseURL}/api/ready`)).status).toBe(200);
  expect(output).not.toContain("a-valid-test-password");
  expect(output).not.toContain("auth-integration-secret-");
  expect(output).not.toContain(token);
}, 15_000);
