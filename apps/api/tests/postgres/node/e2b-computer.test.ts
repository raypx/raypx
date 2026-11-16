import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { createApiClient } from "@raypx/client/api";
import { createComputersService } from "@raypx/computers/server";
import { createComputersRepository } from "@raypx/computers/server/postgres";
import { connectDatabase, migrateDatabase } from "@raypx/database";
import { sandboxConfiguration, spaces, user } from "@raypx/database/schema";
import { createSpaceAccess } from "@raypx/spaces/server/postgres";
import { AuditService } from "../../../src/admin/audit.js";
import { createAdministrationRepository } from "../../../src/admin/repository.js";
import { createSandboxSettings } from "../../../src/config/sandbox.js";
import { createApiApp } from "../../helpers/app.js";
import { testSession } from "../../helpers/session.js";
import { createConfigReads } from "../../../src/config/reads.js";
import { databaseComputerProvider } from "../../../src/runtime/sandbox.js";

const fake = vi.hoisted(() => ({
  guests: new Map<string, string>(),
  keys: new Map<string, string>(),
  live: process.env.RAYPX_TEST_E2B === "1",
  root: "",
  writes: 0,
  bootstraps: 0,
  ready: new Set<string>(),
  dropCreateResponse: true,
}));

// Substitute only the E2B SDK. Each fake sandbox runs the actual guest protocol
// against its own disposable home, and those files disappear when it is killed.
vi.mock(import("@raypx/providers/computer/e2b"), async (original) => {
  const adapter = await original();
  if (fake.live) return adapter;
  const launcher = `
import os, runpy, sys
source, root, operation = sys.argv[1:]
home = runpy.run_path(os.path.join(source, "home.py"))
home.update(HOME=root, WORKSPACE=os.path.join(root, "workspace"))
home["run"].__globals__.update(HOME=home["HOME"], WORKSPACE=home["WORKSPACE"])
run_path = runpy.run_path
runpy.run_path = lambda path: home if path == "/opt/raypx/home.py" else run_path(path)
guest = run_path(os.path.join(source, "e2b.py"))
guest["main"].__globals__["LOCK_PATH"] = os.path.join(os.path.dirname(root), "process.lock")
guest["main"](operation)
`;
  class SandboxNotFoundError extends Error {}
  const sdk = {
    SandboxNotFoundError,
    Sandbox: {
      async create(template: string, options: { idempotencyKey: string }) {
        if (template !== "base") throw new Error("Expected the official base template");
        let sandboxId = fake.keys.get(options.idempotencyKey);
        if (sandboxId) return { sandboxId };
        sandboxId = crypto.randomUUID();
        const base = join(fake.root, sandboxId);
        const home = join(base, "home");
        await mkdir(base, { recursive: true });
        fake.keys.set(options.idempotencyKey, sandboxId);
        fake.guests.set(sandboxId, home);
        if (fake.dropCreateResponse) {
          fake.dropCreateResponse = false;
          throw new Error("Fixture lost the create response");
        }
        return { sandboxId };
      },
      list(options: { query: { metadata: { raypxCreateKey: string } } }) {
        const sandboxId = fake.keys.get(options.query.metadata.raypxCreateKey);
        return {
          hasNext: false,
          nextItems: async () => (sandboxId && fake.guests.has(sandboxId) ? [{ sandboxId }] : []),
        };
      },
      async getInfo(id: string) {
        if (!fake.guests.has(id)) throw new SandboxNotFoundError();
        return { state: "running" };
      },
      async connect(sandboxId: string) {
        const home = fake.guests.get(sandboxId);
        if (!home) throw new SandboxNotFoundError();
        return {
          sandboxId,
          commands: {
            async run(
              command: string,
              options: {
                shell: string[];
                user: string;
                onStdout: (output: string) => void;
              },
            ) {
              const base = join(home, "..");
              const source = join(base, "helpers");
              if (command === "raypx-bootstrap") {
                if (options.user !== "root" || options.shell.at(-2) !== "-c")
                  throw new Error("Expected privileged bootstrap");
                const chunks: Uint8Array[] = [];
                return {
                  sendStdin(bytes: Uint8Array) {
                    chunks.push(bytes);
                  },
                  async closeStdin() {
                    const scripts = JSON.parse(Buffer.concat(chunks).toString()) as {
                      home: string;
                      guest: string;
                    };
                    await mkdir(join(home, "workspace"), { recursive: true });
                    await mkdir(source, { recursive: true });
                    await writeFile(join(source, "home.py"), scripts.home);
                    await writeFile(join(source, "e2b.py"), scripts.guest);
                    await writeFile(join(base, "process.lock"), "");
                    fake.ready.add(sandboxId);
                    fake.bootstraps++;
                  },
                  wait() {},
                  kill() {},
                };
              }
              if (options.user !== "computer" || !fake.ready.has(sandboxId))
                throw new Error("Guest command admitted before bootstrap");
              const operation = options.shell.at(-1)!;
              if (operation === "write") fake.writes++;
              const child = Bun.spawn(["python3", "-I", "-c", launcher, source, home, operation], {
                cwd: home,
                stdin: "pipe",
                stdout: "pipe",
                stderr: "ignore",
              });
              const drain = (async () => {
                const decoder = new TextDecoder();
                for await (const chunk of child.stdout)
                  options.onStdout(decoder.decode(chunk, { stream: true }));
                options.onStdout(decoder.decode());
              })();
              return {
                async sendStdin(bytes: Uint8Array) {
                  await child.stdin.write(bytes);
                  await child.stdin.flush();
                },
                closeStdin: () => child.stdin.end(),
                async wait() {
                  const [code] = await Promise.all([child.exited, drain]);
                  if (code !== 0) throw new Error("Local E2B guest command failed");
                },
                kill: () => child.kill(),
              };
            },
          },
        };
      },
      async kill(id: string) {
        const home = fake.guests.get(id);
        if (!home) return false;
        fake.guests.delete(id);
        fake.ready.delete(id);
        await rm(join(home, ".."), { recursive: true, force: true });
        return true;
      },
    },
  };
  type Options = Parameters<typeof adapter.createE2bComputerProvider>[0];
  type LoadSdk = NonNullable<Options["loadSdk"]>;
  return {
    ...adapter,
    testE2bConnection: async () => ({ status: "e2b-connected" as const }),
    createE2bComputerProvider: (options: Options) =>
      adapter.createE2bComputerProvider({
        ...options,
        loadSdk: async () => sdk as unknown as Awaited<ReturnType<LoadSdk>>,
      }),
  };
});

it("restores the E2B home across a backend restart and fences the old generation", async () => {
  const url = process.env.TEST_DATABASE_URL;
  if (!url || !/_test(?:_[a-z0-9]+)?$/.test(new URL(url).pathname))
    throw new Error("A freshly created disposable test database is required");
  const credential = fake.live
    ? process.env.E2B_API_KEY
    : "fixture-e2b-key-with-at-least-32-characters";
  if (!credential) throw new Error("Set E2B_API_KEY for live acceptance");

  await migrateDatabase(url);
  const secret = "e2b-fixture-configuration-key-32-characters";
  const owner = crypto.randomUUID();
  let spaceId: string | undefined;
  let active: { id: string; generation: number } | undefined;
  let connection = connectDatabase(url);
  let reads = createConfigReads();
  let runtime = databaseComputerProvider(connection.db, secret, reads);
  if (!fake.live) fake.root = await mkdtemp(join(tmpdir(), "raypx-e2b-guests-"));
  try {
    const db = connection.db;
    const access = createSpaceAccess(db);
    const session = testSession(owner);
    await db.insert(user).values({ ...session.user, role: "admin" });
    const { space } = await access.create(owner, { name: "E2B acceptance" });
    spaceId = space.id;
    const scope = await access.resolve(owner, space.id);
    const audit = new AuditService(createAdministrationRepository(db));
    const origin = "https://web.example.test";
    const app = createApiApp({
      audit,
      sandboxSettings: createSandboxSettings(db, secret, audit, reads),
      allowedOrigins: [origin],
      readSession: async () => ({ ...session, user: { ...session.user, role: "admin" } }),
    });
    const config = createApiClient({
      baseUrl: "https://api.example.test",
      headers: { origin },
      fetch: async (input, init) => app.fetch(new Request(input, init)),
    }).configuration;
    const values = { provider: "e2b", url: null, screen: false } as const;
    const saved = await config.updateSandbox({ values, credential, revision: 0 });
    expect(saved.values).toEqual(values);
    expect(saved.hasCredential).toBe(true);
    await expect(config.testSandbox({})).resolves.toEqual({ status: "e2b-connected" });
    const service = createComputersService(createComputersRepository(db), runtime.provider);
    const started = await service.start(scope);
    if (started.status === "available" && started.computer)
      active = { id: started.computer.id, generation: started.computer.generation };
    expect(started).toMatchObject({ status: "available", computer: { state: "running" } });
    if (started.status !== "available" || !started.computer) throw new Error("Start failed");
    expect(fake.keys.size).toBe(fake.live ? 0 : 1);
    const old = { id: started.computer.id, generation: started.computer.generation };
    active = old;
    const initial = "E2B persists files";
    const text = "E2B persists edited files";
    const bytes = Buffer.from(text).toString("base64");
    await runtime.provider.write(old, "saved.txt", Buffer.from(initial).toString("base64"));
    await expect(
      runtime.provider.searchFiles!(old, { path: ".", query: "persists" }),
    ).resolves.toEqual({
      matches: [{ path: "saved.txt", line: 1, text: initial }],
      truncated: false,
    });
    await expect(
      runtime.provider.replaceFile!(old, "saved.txt", { expected: "0".repeat(64), bytes }),
    ).resolves.toEqual({ replaced: false });
    await expect(
      runtime.provider.replaceFile!(old, "saved.txt", {
        expected: createHash("sha256").update(initial).digest("hex"),
        bytes,
      }),
    ).resolves.toEqual({ replaced: true });
    const process = await runtime.provider.execute(old, {
      executable: "printf",
      argv: ["%s", "literal $HOME"],
      cwd: ".",
      environment: {},
      outputBudget: 64,
    });
    const events = await Array.fromAsync(process.events);
    expect(events).toEqual([
      { kind: "stdout", bytes: Buffer.from("literal $HOME").toString("base64") },
      { kind: "exit", status: 0, cancelled: false, truncated: false },
    ]);

    const sleeping = await runtime.provider.execute(old, {
      executable: "sleep",
      argv: ["30"],
      cwd: ".",
      environment: {},
      outputBudget: 8,
    });
    const cancelledEvents = Array.fromAsync(sleeping.events);
    await sleeping.cancel();
    expect((await cancelledEvents).at(-1)).toMatchObject({ kind: "exit", cancelled: true });

    expect(await service.stop(scope)).toMatchObject({
      computer: { state: "stopped", homeRevision: expect.stringMatching(/^[a-f0-9]{64}$/) },
    });
    expect(fake.guests.size).toBe(0);

    reads.close();
    await connection.close();
    connection = connectDatabase(url);
    reads = createConfigReads();
    runtime = databaseComputerProvider(connection.db, secret, reads);
    const worker = createComputersService(
      createComputersRepository(connection.db),
      runtime.provider,
    );
    const restarted = await worker.start(scope);
    if (restarted.status === "available" && restarted.computer)
      active = { id: restarted.computer.id, generation: restarted.computer.generation };
    expect(restarted).toMatchObject({
      computer: { id: old.id, generation: old.generation + 1, state: "running" },
    });
    if (restarted.status !== "available" || !restarted.computer) throw new Error("Restart failed");
    active = { id: old.id, generation: restarted.computer.generation };

    await expect(runtime.provider.read(active, "saved.txt", 64)).resolves.toEqual({ bytes });
    await expect(worker.readFile(scope, "saved.txt", 3)).resolves.toMatchObject({
      status: "available",
      bytes: Buffer.from("E2B").toString("base64"),
      truncated: true,
    });
    expect(fake.bootstraps).toBe(fake.live ? 0 : 2);
    const writes = fake.writes;
    await expect(runtime.provider.write(old, "saved.txt", "Y29ycnVwdA==")).rejects.toMatchObject({
      code: "STALE_GENERATION",
    });
    expect(fake.writes).toBe(writes);
    await expect(runtime.provider.read(active, "saved.txt", 64)).resolves.toEqual({ bytes });
    await worker.stop(scope);
  } finally {
    if (active) await runtime.provider.destroy(active).catch(() => {});
    reads.close();
    try {
      await connection.db
        .delete(sandboxConfiguration)
        .where(eq(sandboxConfiguration.id, "sandbox"));
      if (spaceId) await connection.db.delete(spaces).where(eq(spaces.id, spaceId));
      await connection.db.delete(user).where(eq(user.id, owner));
    } finally {
      await connection.close();
      if (fake.root) await rm(fake.root, { recursive: true, force: true });
    }
  }
}, 180_000);
