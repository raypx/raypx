import { afterAll, beforeAll, expect, it } from "vite-plus/test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname, "../../../..");
const directory = mkdtempSync(join(tmpdir(), "raypx fixture 中文-"));
const payload = join(directory, "payload");
const cwd = join(directory, "unrelated");
const bundle = join(payload, "deployment-fixture.mjs");
const buildEnvironment = {
  TEST_DATABASE_URL: `postgres://synthetic:${crypto.randomUUID()}@example.invalid/operator_database`,
  FIXTURE_ORIGIN: `https://${crypto.randomUUID()}.example.invalid`,
  FIXTURE_EMAIL: `${crypto.randomUUID()}@example.invalid`,
  FIXTURE_PASSWORD: crypto.randomUUID(),
  AUTH_SECRET: crypto.randomUUID(),
};

beforeAll(() => {
  mkdirSync(payload);
  mkdirSync(cwd);
  const result = spawnSync(
    process.execPath,
    ["--no-env-file", "run", "deployment:fixture:build", "--outfile", bundle],
    {
      cwd: join(root, "apps/api"),
      env: { ...process.env, ...buildEnvironment },
      encoding: "utf8",
      timeout: 30_000,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Deployment fixture bundling failed: ${result.stderr}`);
}, 30_000);
afterAll(() => rmSync(directory, { recursive: true, force: true }));

function load(environment: Record<string, string> = {}) {
  return spawnSync(
    process.execPath,
    [
      "--no-env-file",
      "--no-install",
      "--eval",
      `console.log(Bun.version); await import(${JSON.stringify(pathToFileURL(bundle).href)});`,
    ],
    {
      cwd,
      env: {
        ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
        PATH: "",
        ...environment,
      },
      encoding: "utf8",
      timeout: 10_000,
      maxBuffer: 5 * 1024 * 1024,
    },
  );
}

it("loads a single relocated bundle with the pinned Bun and no package installation", () => {
  expect(readdirSync(payload)).toEqual(["deployment-fixture.mjs"]);
  expect(readdirSync(cwd)).toEqual([]);
  const result = load();
  const { packageManager } = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  expect(`bun@${result.stdout.trim()}`).toBe(packageManager);
  expect(result.error).toBeUndefined();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Deployment fixtures require an owned deployment test database");
  expect(readdirSync(cwd)).toEqual([]);
});

it("keeps build-time database credentials and account values out of the bundle", () => {
  const source = readFileSync(bundle, "utf8");
  for (const value of Object.values(buildEnvironment)) expect(source).not.toContain(value);
});

it.each([
  { RAYPX_DEPLOYMENT_FIXTURE: "0" },
  { TEST_DATABASE_URL: "postgres://synthetic:secret@example.invalid/operator_database" },
  { FIXTURE_EMAIL: "person@example.com" },
])("refuses unsafe fixture inputs before connecting to PostgreSQL: %j", (override) => {
  const result = load({
    RAYPX_DEPLOYMENT_FIXTURE: "1",
    TEST_DATABASE_URL: "postgres://synthetic:secret@example.invalid/raypx_deployment_bundle_test",
    FIXTURE_ORIGIN: "https://deployment.example.invalid",
    FIXTURE_EMAIL: "fixture@example.invalid",
    FIXTURE_PASSWORD: "synthetic-fixture-password",
    ...override,
  });
  expect(result.error).toBeUndefined();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("Deployment fixtures require an owned deployment test database");
});
