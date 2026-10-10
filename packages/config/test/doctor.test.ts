import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test, vi } from "vite-plus/test";
import { doctorExitCode, runDoctor } from "../../../scripts/doctor.ts";

const repository = fileURLToPath(new URL("../../../", import.meta.url));
const directories: string[] = [];
const environment = { PATH: process.env.PATH, NODE_ENV: "test" };

function fixture(installed = false): string {
  const root = mkdtempSync(join(tmpdir(), "raypx-doctor-"));
  directories.push(root);
  for (const directory of [
    "apps/web",
    "scripts",
    "packages/config/src",
    "packages/env/src",
    "packages/db/migrations/meta",
  ])
    mkdirSync(join(root, directory), { recursive: true });
  const bunVersion = execFileSync("bun", ["--version"], { encoding: "utf8" }).trim();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      devEngines: {
        runtime: { name: "node", version: process.versions.node, onFail: "error" },
        packageManager: { name: "bun", version: bunVersion, onFail: "error" },
      },
      packageManager: `bun@${bunVersion}`,
      engines: { bun: bunVersion },
    }),
  );
  writeFileSync(join(root, ".node-version"), process.versions.node);
  writeFileSync(join(root, ".bun-version"), bunVersion);
  writeFileSync(join(root, "bun.lock"), "fixture");
  writeFileSync(join(root, "apps/web/package.json"), "{}");
  writeFileSync(join(root, "packages/env/package.json"), '{"type":"module"}');
  writeFileSync(join(root, "packages/db/migrations/meta/_journal.json"), '{"entries":[]}');
  copyFileSync(
    join(repository, "packages/config/src/environment.ts"),
    join(root, "packages/config/src/environment.ts"),
  );
  for (const name of ["doctor.ts", "doctor-database.ts"])
    copyFileSync(join(repository, "scripts", name), join(root, "scripts", name));
  if (installed) {
    copyFileSync(
      join(repository, "packages/env/src/server.ts"),
      join(root, "packages/env/src/server.ts"),
    );
    symlinkSync(
      join(repository, "packages/env/node_modules"),
      join(root, "packages/env/node_modules"),
      "junction",
    );
    mkdirSync(join(root, "node_modules/.bin"), { recursive: true });
    writeFileSync(join(root, "node_modules/.bin/vp"), "fixture");
    mkdirSync(join(root, "packages/contracts/src"), { recursive: true });
    copyFileSync(
      join(repository, "packages/contracts/src/health.ts"),
      join(root, "packages/contracts/src/health.ts"),
    );
    symlinkSync(
      join(repository, "packages/contracts/node_modules"),
      join(root, "packages/contracts/node_modules"),
      "junction",
    );
  }
  return root;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test("a dependency-free checkout returns a bootstrap report without dist, network, or database writes", async () => {
  const root = fixture();
  const fetch = vi.fn<typeof globalThis.fetch>();
  vi.stubGlobal("fetch", fetch);
  const report = await runDoctor({ root, environment });
  expect(report.schemaVersion).toBe(1);
  expect(report.checks).toContainEqual(
    expect.objectContaining({ code: "DEPENDENCIES_NOT_INSTALLED", status: "warning" }),
  );
  expect(report.checks).toContainEqual(
    expect.objectContaining({ code: "ENV_VALIDATION_SKIPPED", status: "skipped" }),
  );
  expect(doctorExitCode(report)).toBe(0);
  expect(fetch).not.toHaveBeenCalled();
  expect(existsSync(join(root, "apps/web/data"))).toBe(false);
  expect(existsSync(join(root, "packages/env/dist"))).toBe(false);
});

test("the real source CLI bootstraps without dependencies from an unrelated cwd", () => {
  const root = fixture();
  const result = spawnSync("bun", ["--no-env-file", join(root, "scripts/doctor.ts"), "--json"], {
    cwd: tmpdir(),
    env: environment,
    encoding: "utf8",
    timeout: 15_000,
  });
  expect(result.status).toBe(0);
  const report: unknown = JSON.parse(result.stdout);
  expect(report).toMatchObject({ schemaVersion: 1, status: "warning" });
  expect(result.stderr).toBe("");
  expect(existsSync(join(root, "apps/web/data"))).toBe(false);
});

test("native application env loading preserves shell overrides, empty values, and Nitro precedence", () => {
  const root = fixture(true);
  const sentinel = "private-doctor-sentinel";
  writeFileSync(
    join(root, "apps/web/.env"),
    `PORT=invalid\nNITRO_PORT=${sentinel}\nAPP_VERSION=${sentinel}\n`,
  );
  writeFileSync(join(root, "apps/web/.env.test.local"), "NITRO_PORT=4200\n");
  const run = (values: Record<string, string>) =>
    spawnSync("bun", ["--no-env-file", join(root, "scripts/doctor.ts"), "--json"], {
      env: { ...environment, ...values },
      encoding: "utf8",
      timeout: 15_000,
    });
  const modeOverride = run({});
  expect(modeOverride.status).toBe(0);
  expect(JSON.parse(modeOverride.stdout)).toMatchObject({
    checks: expect.arrayContaining([expect.objectContaining({ code: "ENV_VALID" })]),
  });
  const shellBlank = run({ NITRO_PORT: "", PORT: sentinel });
  expect(shellBlank.status).toBe(1);
  expect(JSON.parse(shellBlank.stdout)).toMatchObject({
    checks: expect.arrayContaining([
      expect.objectContaining({ code: "ENV_INVALID", fields: ["PORT"] }),
    ]),
  });
  const shellOverride = run({ NITRO_PORT: "4300", PORT: sentinel });
  expect(shellOverride.status).toBe(0);
  for (const result of [modeOverride, shellBlank, shellOverride])
    expect(result.stdout + result.stderr).not.toContain(sentinel);
});

test("invalid configuration returns only its field names without configured values", async () => {
  const root = fixture(true);
  const sentinel = "private-override-sentinel";
  const report = await runDoctor({
    root,
    environment: {
      ...environment,
      NITRO_PORT: sentinel,
      DATABASE_PATH: join(root, sentinel),
      BETTER_AUTH_SECRET: sentinel,
    },
  });
  expect(report.checks).toContainEqual(
    expect.objectContaining({
      code: "ENV_INVALID",
      fields: expect.arrayContaining(["NITRO_PORT", "BETTER_AUTH_SECRET"]),
    }),
  );
  expect(doctorExitCode(report)).toBe(1);
  expect(JSON.stringify(report)).not.toContain(sentinel);
  expect(JSON.stringify(report)).not.toContain(root);
});

test("invalid CLI probe URLs and arguments return a single sanitized JSON report with exit 2", () => {
  const root = fixture();
  const sentinel = "private-url-sentinel";
  for (const args of [["--probe", `https://user:${sentinel}@example.com`], [`--${sentinel}`]]) {
    const result = spawnSync(
      "bun",
      ["--no-env-file", join(root, "scripts/doctor.ts"), "--json", ...args],
      { env: environment, encoding: "utf8", timeout: 10_000 },
    );
    expect(result.status).toBe(2);
    expect(JSON.parse(result.stdout)).toMatchObject({ schemaVersion: 1, status: "error" });
    expect(result.stdout + result.stderr).not.toContain(sentinel);
  }
});

test("optional failed readiness checks are a warning while unavailable readiness fails", async () => {
  const root = fixture(true);
  for (const available of [true, false]) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        Response.json(
          url.endsWith("/api/health")
            ? { status: "ok", service: "raypx-api" }
            : {
                status: available ? "ok" : "unavailable",
                service: "raypx-api",
                checks: { optional: "failed" },
              },
          { status: available || url.endsWith("/api/health") ? 200 : 503 },
        ),
      ),
    );
    const report = await runDoctor({ root, environment, probe: "http://127.0.0.1:3000" });
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        code: available ? "SERVICE_DEGRADED" : "PROBE_FAILED",
        status: available ? "warning" : "error",
      }),
    );
    expect(doctorExitCode(report)).toBe(available ? 0 : 1);
  }
});

test("response contracts reject malformed health data without exposing it", async () => {
  const root = fixture(true);
  const sentinel = "private-response-sentinel";
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ status: "ok", service: sentinel })),
  );
  const report = await runDoctor({ root, environment, probe: "http://127.0.0.1:3000" });
  expect(report.checks).toContainEqual(expect.objectContaining({ code: "PROBE_FAILED" }));
  expect(JSON.stringify(report)).not.toContain(sentinel);
});

test("oversize bodies fail promptly even when stream cancellation never resolves", async () => {
  const root = fixture(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(65 * 1024));
            },
            cancel() {
              return new Promise<void>(() => undefined);
            },
          }),
        ),
    ),
  );
  const started = Date.now();
  const report = await runDoctor({ root, environment, probe: "http://127.0.0.1:3000" });
  expect(report.checks).toContainEqual(expect.objectContaining({ code: "PROBE_FAILED" }));
  expect(Date.now() - started).toBeLessThan(3000);
});

test("a stalled probe body observes the five-second deadline", async () => {
  const root = fixture(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              return new Promise<void>(() => undefined);
            },
          }),
        ),
    ),
  );
  const started = Date.now();
  const report = await runDoctor({ root, environment, probe: "http://127.0.0.1:3000" });
  expect(report.checks).toContainEqual(expect.objectContaining({ code: "PROBE_TIMEOUT" }));
  expect(Date.now() - started).toBeLessThan(7000);
}, 10_000);

test("an explicit database probe reports a missing file without creating it", async () => {
  const root = fixture(true);
  const path = join(root, "private-database-path", "missing.db");
  const report = await runDoctor({
    root,
    environment: { ...environment, DATABASE_PATH: path },
    database: true,
  });
  expect(report.checks).toContainEqual(
    expect.objectContaining({ code: "DATABASE_MISSING", status: "error" }),
  );
  expect(existsSync(path)).toBe(false);
  expect(existsSync(join(root, "private-database-path"))).toBe(false);
  expect(JSON.stringify(report)).not.toContain(path);
});

test("an explicit database probe verifies real migrations without changing database contents", () => {
  const root = fixture(true);
  const database = join(root, "existing.db");
  const dbModule = fileURLToPath(new URL("../../db/src/index.ts", import.meta.url));
  const initialize = spawnSync(
    "bun",
    [
      "--no-env-file",
      "-e",
      `const {createDatabase,runMigrations}=await import(${JSON.stringify(dbModule)});const connection=createDatabase(process.env.DATABASE_PATH);runMigrations(connection.db);connection.close();`,
    ],
    {
      env: { ...environment, DATABASE_PATH: database, LOG_LEVEL: "silent" },
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  expect(initialize.status).toBe(0);
  copyFileSync(
    join(repository, "packages/db/migrations/0000_auth-foundation.sql"),
    join(root, "packages/db/migrations/0000_auth-foundation.sql"),
  );
  copyFileSync(
    join(repository, "packages/db/migrations/meta/_journal.json"),
    join(root, "packages/db/migrations/meta/_journal.json"),
  );
  const before = readFileSync(database);
  const result = spawnSync(
    "bun",
    ["--no-env-file", join(root, "scripts/doctor.ts"), "--json", "--database"],
    { env: { ...environment, DATABASE_PATH: database }, encoding: "utf8", timeout: 15_000 },
  );
  expect(result.status).toBe(0);
  expect(JSON.parse(result.stdout)).toMatchObject({
    checks: expect.arrayContaining([
      expect.objectContaining({ code: "DATABASE_READY", status: "ok" }),
    ]),
  });
  expect(readFileSync(database)).toEqual(before);
  expect(result.stdout + result.stderr).not.toContain(database);
  writeFileSync(
    join(root, "packages/db/migrations/0000_auth-foundation.sql"),
    `${readFileSync(join(root, "packages/db/migrations/0000_auth-foundation.sql"), "utf8")}\n`,
  );
  const drifted = spawnSync(
    "bun",
    ["--no-env-file", join(root, "scripts/doctor.ts"), "--json", "--database"],
    { env: { ...environment, DATABASE_PATH: database }, encoding: "utf8", timeout: 15_000 },
  );
  expect(drifted.status).toBe(1);
  expect(JSON.parse(drifted.stdout)).toMatchObject({
    checks: expect.arrayContaining([
      expect.objectContaining({ code: "DATABASE_MIGRATIONS_PENDING" }),
    ]),
  });
  expect(readFileSync(database)).toEqual(before);
});
