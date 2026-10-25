import { relaySocket } from "../../helpers/relay.js";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { createAuth, type AuthMailInput } from "@raypx/auth/server";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { schema, user } from "@raypx/database/schema";
import { createApiClient } from "@raypx/client";
import { pinnedNode } from "@raypx/tooling/repository";
import { eq } from "drizzle-orm";

const databaseURL = process.env.TEST_DATABASE_URL;
if (!databaseURL || !new URL(databaseURL).pathname.endsWith("_test"))
  throw new Error("TEST_DATABASE_URL must name an isolated *_test database");
const root = fileURLToPath(new URL("../../../../../", import.meta.url));

async function worker(mode: string) {
  const child = spawn(
    pinnedNode(root),
    [fileURLToPath(import.meta.resolve("@raypx/tooling/cloudflare")), root, "--serve-api"],
    {
      cwd: root,
      env: { ...process.env, TEST_DATABASE_URL: databaseURL, TEST_DATABASE_MODE: mode },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  try {
    const base = await new Promise<string>((resolve, reject) => {
      let pending = "";
      let errors = "";
      const timer = setTimeout(
        () => reject(new Error("Worker PostgreSQL fixture startup timed out")),
        60000,
      );
      const cleanup = () => clearTimeout(timer);
      child.stderr.on("data", (chunk: Buffer) => {
        errors = (errors + chunk.toString())
          .replace(/postgres(?:ql)?:\/\/[^\s]+/g, "[DATABASE_URL]")
          .slice(-2000);
      });
      child.stdout.on("data", (chunk: Buffer) => {
        pending += chunk.toString();
        let offset: number;
        while ((offset = pending.indexOf("\n")) >= 0) {
          const line = pending.slice(0, offset);
          pending = pending.slice(offset + 1);
          try {
            const message = JSON.parse(line) as { type?: string; url?: string };
            if (message.type === "raypx-worker-ready" && message.url) {
              cleanup();
              resolve(message.url);
            }
          } catch {
            /* Wrangler may also print diagnostic lines. */
          }
        }
      });
      child.once("error", (error) => {
        cleanup();
        reject(error);
      });
      child.once("exit", (code) => {
        cleanup();
        reject(new Error(`Worker fixture exited ${code}: ${errors}`));
      });
    });
    return { child, base };
  } catch (error) {
    await stop(child);
    throw error;
  }
}

async function stop(child: ChildProcess) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, "exit");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
  try {
    await closed;
  } finally {
    clearTimeout(timer);
  }
}

describe.each(["direct", "hyperdrive"])("Cloudflare account API (%s)", (mode) => {
  const connection = connectDatabase(databaseURL);
  const email = `worker-${crypto.randomUUID()}@example.test`;
  const emails: AuthMailInput[] = [];
  // Mail creation and delivery are tested separately. This fixture seeds a
  // verified account and issues a reset token without contacting a real provider.
  const auth = createAuth({
    database: drizzleAdapter(connection.db, { provider: "pg", schema }),
    mailer: {
      sendVerification: async (input) => {
        emails.push(input);
      },
      sendPasswordReset: async (input) => {
        emails.push(input);
      },
    },
    config: {
      baseURL: "http://localhost:3002",
      secret: "raypx-artifact-test-secret-32-characters",
      trustedOrigins: ["http://localhost:3000"],
      production: false,
    },
  });
  let fixture: Awaited<ReturnType<typeof worker>> | undefined;

  beforeAll(async () => {
    await migrateDatabase(databaseURL);
    const signup = await auth.handler(
      new Request("http://localhost:3002/api/auth/sign-up/email", {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: JSON.stringify({
          email,
          name: "Worker Account",
          password: "worker-original-password-123",
        }),
      }),
    );
    const verification = emails[0];
    if (signup.status !== 200 || !verification)
      throw new Error("Worker fixture account could not be created");
    const verified = await auth.handler(new Request(verification.url));
    if (verified.status !== 200 && verified.status !== 302)
      throw new Error("Worker fixture account could not be verified");
    fixture = await worker(mode);
  }, 90000);

  afterAll(async () => {
    if (fixture) await stop(fixture.child);
    try {
      await connection.db.delete(user).where(eq(user.email, email));
    } finally {
      await connection.close();
    }
  });

  it("signs in, reads fresh sessions, resets passwords and revokes sessions across requests", async () => {
    const base = fixture!.base;
    const post = (path: string, data: object, cookie = "") =>
      fetch(`${base}/api/auth/${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000", cookie },
        body: JSON.stringify(data),
      });
    const cookies = (response: Response) =>
      response.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
    const signedIn = await post("sign-in/email", {
      email,
      password: "worker-original-password-123",
    });
    expect(signedIn.status).toBe(200);
    const cookie = cookies(signedIn);
    expect(cookie).toContain("session_token");
    const client = createApiClient({ baseUrl: base, headers: { cookie } });
    const accounts = await Promise.all(Array.from({ length: 3 }, () => client.account.get({})));
    expect(accounts.every((account) => account.email === email)).toBe(true);
    const grant = await client.devices.register({
      installationId: crypto.randomUUID(),
      name: "Worker fixture",
      platform: "test",
      appVersion: "0.1.0",
      reconnect: false,
    });
    const native = await relaySocket(base, (await client.account.get({})).id, {
      type: "auth",
      protocolVersion: 2,
      role: "device",
      token: grant.token,
    });
    await native.take("ready");
    const projectId = crypto.randomUUID(),
      streamId = crypto.randomUUID(),
      task = {
        id: crypto.randomUUID(),
        deviceId: grant.deviceId,
        projectId,
        provider: "codex" as const,
        mode: "run" as const,
        prompt: "Worker relay task",
        status: "succeeded" as const,
        summary: "Worker relay result",
        parentTaskId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    native.send({
      type: "announce",
      streamId,
      instanceId: crypto.randomUUID(),
      projects: [{ id: projectId, name: "Fixture", providers: ["codex"], dirty: false }],
      capabilities: [{ provider: "codex", available: true, version: "0.163.0", reason: "ready" }],
    });
    await native.take("resume");
    native.send({
      type: "snapshot",
      id: crypto.randomUUID(),
      streamId,
      sequence: 0,
      records: [],
      done: true,
    });
    await native.take("ack");
    native.send({ type: "available" });
    native.send({
      type: "events",
      streamId,
      events: [
        {
          sequence: 1,
          event: {
            id: crypto.randomUUID(),
            taskId: task.id,
            kind: "status",
            status: task.status,
            summary: task.summary,
            task,
          },
        },
      ],
    });
    await native.take("ack");
    expect((await client.tasks.get({ id: task.id, after: 0 })).task.summary).toBe(
      "Worker relay result",
    );

    expect(
      (
        await auth.handler(
          new Request("http://localhost:3002/api/auth/request-password-reset", {
            method: "POST",
            headers: { "content-type": "application/json", origin: "http://localhost:3000" },
            body: JSON.stringify({ email, redirectTo: "http://localhost:3000/reset-password" }),
          }),
        )
      ).status,
    ).toBe(200);
    const token = new URL(emails.at(-1)!.url).pathname.split("/").at(-1)!;
    expect(
      (await post("reset-password", { token, newPassword: "worker-replaced-password-456" })).status,
    ).toBe(200);
    await expect(client.account.get({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    native.send({ type: "ping" });
    expect((await native.take("error")).code).toBe("AUTH_REQUIRED");
    native.socket.close();
    expect(
      (await post("sign-in/email", { email, password: "worker-original-password-123" })).status,
    ).toBe(401);
    const replacement = await post("sign-in/email", {
      email,
      password: "worker-replaced-password-456",
    });
    expect(replacement.status).toBe(200);
    const replacementCookie = cookies(replacement);
    expect((await post("sign-out", {}, replacementCookie)).status).toBe(200);
    const signedOut = createApiClient({ baseUrl: base, headers: { cookie: replacementCookie } });
    await expect(signedOut.account.get({})).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  }, 60000);
});
