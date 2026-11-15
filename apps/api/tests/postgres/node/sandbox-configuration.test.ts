import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { adminAudit, computers, sandboxConfiguration, spaces, user } from "@raypx/database/schema";
import { createApiClient } from "@raypx/client/api";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import { createComputersRepository } from "@raypx/computers/server/postgres";
import { createComputersService } from "@raypx/computers/server";
import { createMemoryComputerProvider, ComputerError } from "@raypx/providers/computer";
import { eq, inArray } from "drizzle-orm";
import { testSession } from "../../helpers/session.js";
import { createApiApp } from "../../helpers/app.js";
import { createConfigReads } from "../../../src/config/reads.js";
import { AuditService } from "../../../src/admin/audit.js";
import { createAdministrationRepository } from "../../../src/admin/repository.js";
import { createSandboxSettings, initializeSandbox } from "../../../src/config/sandbox.js";
import { composeAgents } from "../../../src/runtime/agents.js";
import { getWorkerEnvironment } from "../../../src/env.js";
import { createApiLogging } from "../../../src/logging.js";
import { databaseComputerProvider } from "../../../src/runtime/sandbox.js";

const url = process.env.TEST_DATABASE_URL;
if (
  !url ||
  !["postgres:", "postgresql:"].includes(new URL(url).protocol) ||
  !["127.0.0.1", "localhost", "[::1]"].includes(new URL(url).hostname) ||
  !/^\/[a-z0-9_]+_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname) ||
  new URL(url).search ||
  new URL(url).hash
)
  throw new Error(
    "Sandbox configuration acceptance requires an explicit disposable loopback test database without query options",
  );
const connection = connectDatabase(url);
const other = connectDatabase(url);
const secret = "fake-configuration-encryption-key-32-characters";
const credential = "fake-supervisor-token-32-characters-only";
const origin = "https://web.example.test";
beforeAll(() => migrateDatabase(url));
afterAll(async () => {
  await connection.close();
  await other.close();
});

it("keeps sandbox configuration admin-only, encrypted and live across independent roles without Redis", async () => {
  const { db } = connection;
  const actor = testSession(`sandbox-${crypto.randomUUID()}`);
  const outsider = testSession(`sandbox-outsider-${crypto.randomUUID()}`);
  await db.insert(user).values([actor.user, outsider.user]);
  let auth = { ...actor, user: { ...actor.user, role: "member" } };
  const audit = new AuditService(createAdministrationRepository(db));
  const publish = vi.fn();
  const reads = createConfigReads({ publish, subscribe: () => () => {} });
  const remoteReads = createConfigReads();
  const local = databaseComputerProvider(db, secret, reads);
  const remote = databaseComputerProvider(other.db, secret, remoteReads);
  const access = createSpaceAccess(db);
  const repository = createComputersRepository(db);
  const lifecycle = createComputersService(repository, local.provider);
  const logger = createApiLogging({ environment: "test", sink: () => {} });
  // This is the same shared composition used by the split worker entry point.
  const split = await composeAgents(
    other.db,
    getWorkerEnvironment({ NODE_ENV: "test", DATABASE_URL: url, APP_KEY: secret }),
    logger,
  );
  const worker = split.computers;
  const settings = createSandboxSettings(db, secret, audit, reads);
  const app = createApiApp({
    audit,
    sandboxSettings: settings,
    computers: lifecycle,
    spaces: access,
    readSession: async () => auth,
    allowedOrigins: [origin],
  });
  const api = (requestOrigin = origin) =>
    createApiClient({
      baseUrl: "https://api.example.test",
      headers: { origin: requestOrigin },
      fetch: async (input, init) => app.fetch(new Request(input, init)),
    });
  const client = api().configuration;
  const owned: string[] = [];
  let mode: "ok" | "timeout" = "ok";
  let gate: (() => void) | undefined;
  let waitForCreate: (() => void) | undefined;
  let creates = 0;
  function supervisor() {
    const memory = createMemoryComputerProvider();
    return Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      async fetch(request) {
        if (request.headers.get("authorization") !== `Bearer ${credential}`)
          return Response.json({ code: "UNAUTHORIZED" }, { status: 401 });
        if (mode === "timeout") return new Promise<Response>(() => {});
        const path = new URL(request.url).pathname;
        if (path === "/description")
          return Response.json({
            execution: "isolated-process",
            home: true,
            files: true,
            egress: "restricted",
            unenforced: [],
            screen: true,
            hosting: { untrustedTenants: true, runtime: "runsc" },
          });
        const body = (await request.json()) as { generation: number };
        const ref = { id: path.split("/")[2]!, generation: body.generation };
        try {
          if (path.endsWith("/create")) {
            creates++;
            const result = await memory.provision(ref);
            if (waitForCreate) {
              waitForCreate();
              await new Promise<void>((resolve) => {
                gate = resolve;
              });
            }
            return Response.json(result);
          }
          if (path.endsWith("/stop")) return Response.json(await memory.stop(ref));
          return Response.json(await memory.get(ref));
        } catch (error) {
          return Response.json(
            { code: error instanceof ComputerError ? error.code : "PROVIDER_UNAVAILABLE" },
            { status: 404 },
          );
        }
      },
    });
  }
  const server = supervisor();
  const replacement = supervisor();
  const values = { provider: "docker", url: server.url.origin, screen: false } as const;
  try {
    for (const run of [
      () => client.sandbox({}),
      () => client.updateSandbox({ values, credential, revision: 0 }),
      () => client.testSandbox({}),
    ])
      await expect(run()).rejects.toMatchObject({ code: "FORBIDDEN" });
    auth = { ...actor, user: { ...actor.user, role: "admin" } };
    expect(await client.sandbox({})).toMatchObject({
      revision: 0,
      values: { provider: "none" },
      hasCredential: false,
    });
    const { space } = await access.create(actor.user.id, { name: "Sandbox configuration fixture" });
    owned.push(space.id);
    const scope = await access.resolve(actor.user.id, space.id);
    expect(await worker.start(scope)).toEqual({ status: "not-configured" });
    await expect(
      api("https://untrusted.example.test").configuration.updateSandbox({
        values,
        credential,
        revision: 0,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const saved = await client.updateSandbox({ values, credential, revision: 0 });
    expect(saved).toMatchObject({ revision: 1, hasCredential: true, values });
    expect(JSON.stringify(saved)).not.toContain(credential);
    expect(await remote.provider.configured!()).toBe(true);
    expect(await client.testSandbox({})).toEqual({
      status: "connected",
      untrustedTenants: true,
      runtime: "runsc",
      screen: true,
    });
    expect(await worker.start(scope)).toMatchObject({
      status: "available",
      computer: { state: "running" },
    });
    expect(creates).toBe(1);
    auth = { ...outsider, user: { ...outsider.user, role: "admin" } };
    await expect(api().computers.get({ spaceId: space.id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    auth = { ...actor, user: { ...actor.user, role: "admin" } };
    await expect(client.updateSandbox({ values, credential, revision: 0 })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      client.updateSandbox({ values: { ...values, url: replacement.url.origin }, revision: 1 }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await client.updateSandbox({
      values: { ...values, url: replacement.url.origin, screen: true },
      credential,
      revision: 1,
    });
    expect(await worker.get(scope)).toMatchObject({ unavailableReason: "PROVIDER_UNAVAILABLE" });
    expect(await worker.start(scope)).toMatchObject({ unavailableReason: "PROVIDER_UNAVAILABLE" });
    expect(creates).toBe(1);
    await client.updateSandbox({ values, credential, revision: 2 });
    expect((await remote.provider.describe()).screen).toBe(false);
    expect(await worker.get(scope)).not.toHaveProperty("unavailableReason");
    // Disabling during an admitted provision must produce failure and contain at its original host.
    const nextSpace = (await access.create(actor.user.id, { name: "In-flight fixture" })).space;
    owned.push(nextSpace.id);
    const nextScope = await access.resolve(actor.user.id, nextSpace.id);
    const started = new Promise<void>((resolve) => {
      waitForCreate = resolve;
    });
    const pending = worker.start(nextScope);
    await started;
    await client.updateSandbox({ values: { ...values, provider: "none" }, revision: 3 });
    gate!();
    waitForCreate = undefined;
    expect(await pending).toMatchObject({
      computer: { state: "failed", failureCode: "PROVIDER_UNAVAILABLE" },
    });
    expect(await worker.get(scope)).toEqual({ status: "not-configured" });
    expect(await lifecycle.start(scope)).toEqual({ status: "not-configured" });
    await client.updateSandbox({
      values,
      credential: "fake-wrong-token-32-characters-long",
      revision: 4,
    });
    expect(await client.testSandbox({})).toEqual({ status: "authentication-failed" });
    await client.updateSandbox({ values, credential, revision: 5 });
    mode = "timeout";
    expect(await client.testSandbox({})).toEqual({ status: "timeout" });
    mode = "ok";
    const before = await settings.read();
    await initializeSandbox(db, secret, { values: { ...values, provider: "none" }, revision: 0 });
    expect(await settings.read()).toEqual(before);
    const [stored] = await db.select().from(sandboxConfiguration);
    expect(stored!.credentials).not.toContain(credential);
    expect(stored!.credentials).not.toBe(credential);
    const evidence = await db
      .select()
      .from(adminAudit)
      .where(eq(adminAudit.actorId, actor.user.id));
    expect(JSON.stringify(evidence)).not.toContain(credential);
    expect(JSON.stringify(evidence)).not.toContain(values.url);
    expect(publish).toHaveBeenCalledWith({ scope: "sandbox", revision: 6 });
  } finally {
    gate?.();
    await server.stop(true);
    await replacement.stop(true);
    reads.close();
    remoteReads.close();
    await split.runner.close();
    await split.routineWorker.close();
    await split.spaceDeletionWorker.close();
    await split.deviceConnector.shutdown();
    await logger.close();
    await db.delete(computers).where(inArray(computers.spaceId, owned));
    await db.delete(spaces).where(inArray(spaces.id, owned));
    await db.delete(sandboxConfiguration).where(eq(sandboxConfiguration.id, "sandbox"));
    await db
      .delete(adminAudit)
      .where(inArray(adminAudit.actorId, [actor.user.id, outsider.user.id]));
    await db.delete(user).where(inArray(user.id, [actor.user.id, outsider.user.id]));
  }
}, 20000);

it("imports sandbox environment only explicitly and never overwrites a saved row", async () => {
  const command = fileURLToPath(new URL("../../../src/config/migrate.ts", import.meta.url));
  const env = {
    DATABASE_URL: url,
    APP_KEY: secret,
    COMPUTER_PROVIDER: "docker",
    SANDBOX_SUPERVISOR_URL: "https://supervisor.example.test",
    SANDBOX_SUPERVISOR_TOKEN: credential,
    COMPUTER_SCREEN_ENABLED: "true",
  };
  async function migrate(args: string[], inputs = env) {
    const child = Bun.spawn([process.execPath, "--no-env-file", command, ...args], {
      env: inputs,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
    });
    const [code, stdout, stderr] = await Promise.all([
      child.exited,
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
    ]);
    expect(code).toBe(0);
    expect(stdout + stderr).not.toContain(credential);
  }
  try {
    await migrate([]);
    expect(await connection.db.select().from(sandboxConfiguration)).toHaveLength(0);
    await migrate(["--import-config"]);
    const [saved] = await connection.db.select().from(sandboxConfiguration);
    expect(saved).toMatchObject({
      provider: "docker",
      url: env.SANDBOX_SUPERVISOR_URL,
      screen: true,
      revision: 1,
    });
    expect(saved!.credentials).not.toBe(credential);
    await migrate(["--import-config"], { ...env, COMPUTER_PROVIDER: "none" });
    expect(await connection.db.select().from(sandboxConfiguration)).toEqual([saved]);
  } finally {
    await connection.db.delete(sandboxConfiguration).where(eq(sandboxConfiguration.id, "sandbox"));
  }
});
