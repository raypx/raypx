import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  cpSync,
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
import { afterEach, expect, test } from "vite-plus/test";

const repository = fileURLToPath(new URL("../../", import.meta.url));
const directories: string[] = [];
const environment = { PATH: process.env.PATH, NODE_ENV: "test" };

function fixture(): { root: string; cwd: string } {
  const root = mkdtempSync(join(tmpdir(), "raypx-bootstrap-"));
  const cwd = mkdtempSync(join(tmpdir(), "raypx-bootstrap-cwd-"));
  directories.push(root, cwd);
  mkdirSync(join(root, "apps/web"), { recursive: true });
  mkdirSync(join(root, "scripts"), { recursive: true });
  mkdirSync(join(root, "packages/config/src"), { recursive: true });
  const bunVersion = execFileSync("bun", ["--version"], { encoding: "utf8" }).trim();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({
      name: "raypx",
      version: "0.1.0",
      type: "module",
      packageManager: `bun@${bunVersion}`,
      engines: { bun: bunVersion },
      devEngines: {
        runtime: { name: "node", version: `^${process.versions.node}`, onFail: "error" },
        packageManager: { name: "bun", version: bunVersion, onFail: "error" },
      },
    }),
  );
  writeFileSync(join(root, ".node-version"), process.versions.node);
  writeFileSync(join(root, ".bun-version"), bunVersion);
  writeFileSync(join(root, "apps/web/.env.example"), "LOCAL_FIXTURE=template\n");
  cpSync(join(repository, "scripts/bin"), join(root, "scripts/bin"), { recursive: true });
  cpSync(join(repository, "scripts/lib/cli"), join(root, "scripts/lib/cli"), {
    recursive: true,
  });
  mkdirSync(join(root, "scripts/lib/doctor"), { recursive: true });
  copyFileSync(
    join(repository, "scripts/lib/doctor/report.ts"),
    join(root, "scripts/lib/doctor/report.ts"),
  );
  copyFileSync(join(repository, "scripts/setup.ts"), join(root, "scripts/setup.ts"));
  copyFileSync(
    join(repository, "packages/config/src/environment.ts"),
    join(root, "packages/config/src/environment.ts"),
  );
  return { root, cwd };
}

function invoke(
  checkout: { root: string; cwd: string },
  args: string[],
  values: Record<string, string> = {},
) {
  return spawnSync(
    "bun",
    ["--no-env-file", "--no-install", join(checkout.root, "scripts/bin/raypx.ts"), ...args],
    {
      cwd: checkout.cwd,
      env: { ...environment, ...values },
      encoding: "utf8",
      timeout: 10_000,
    },
  );
}

function expectNoBootstrapWrites(root: string): void {
  expect(existsSync(join(root, "apps/web/.env"))).toBe(false);
  expect(existsSync(join(root, "apps/web/data"))).toBe(false);
  expect(existsSync(join(root, "node_modules"))).toBe(false);
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

test.each([{ args: [] }, { args: ["--help"] }, { args: ["-h"] }, { args: ["--version"] }])(
  "fresh-checkout root $args help/version bypasses dependency and environment checks",
  ({ args }) => {
    const checkout = fixture();
    writeFileSync(join(checkout.root, ".node-version"), "invalid\n");
    const result = invoke(checkout, args);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain(args[0] === "--version" ? "0.1.0" : "doctor");
    expectNoBootstrapWrites(checkout.root);
  },
);

test.each([
  ["doctor", "--help"],
  ["doctor", "-h"],
  ["env", "--help"],
  ["env", "-h"],
  ["setup", "--help"],
  ["setup", "-h"],
])("sole command help %s %s has no bootstrap actions", (command, flag) => {
  const checkout = fixture();
  writeFileSync(join(checkout.root, ".node-version"), "invalid\n");
  const result = invoke(checkout, [command, flag]);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain(command);
  expect(result.stderr).toBe("");
  expectNoBootstrapWrites(checkout.root);
});

test.each([
  { args: ["setup", "--unknown"] },
  { args: ["env", "--unknown"] },
  { args: ["setup", "--help", "--unknown"] },
  { args: ["env", "--help", "--unknown"] },
])("unsupported bootstrap arguments $args fail without actions", ({ args }) => {
  const checkout = fixture();
  const result = invoke(checkout, args);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expectNoBootstrapWrites(checkout.root);
});

test.each([
  { args: ["consumer"] },
  { args: ["consumer", "--help"] },
  { args: ["consumer-browser"] },
  { args: ["consumer-browser", "--help"] },
  { args: ["policy"] },
  { args: ["policy", "--help"] },
  { args: ["verify"] },
  { args: ["verify", "--help"] },
])("fresh-checkout $args requires installation without bootstrap actions", ({ args }) => {
  const checkout = fixture();
  writeFileSync(join(checkout.root, ".node-version"), "invalid\n");
  const result = invoke(checkout, args);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stdout).toBe("");
  expect(result.stderr).toContain("bun install");
  expect(result.stderr).not.toContain("Development environment");
  expectNoBootstrapWrites(checkout.root);
});

test.each([{ args: ["unknown", "--help"] }, { args: ["--help", "consumer"] }])(
  "fresh-checkout invalid root namespace $args does not start tooling",
  ({ args }) => {
    const checkout = fixture();
    writeFileSync(join(checkout.root, ".node-version"), "invalid\n");
    const result = invoke(checkout, args);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain("Unknown command or root option");
    expect(result.stderr).not.toContain("Development environment");
    expectNoBootstrapWrites(checkout.root);
  },
);

test("setup resolves its checkout from any cwd and preserves an existing application env", () => {
  const checkout = fixture();
  const target = join(checkout.root, "apps/web/.env");
  const first = invoke(checkout, ["setup"]);
  expect(first.error).toBeUndefined();
  expect(first.status).toBe(0);
  expect(first.stderr).toBe("");
  expect(readFileSync(target, "utf8")).toBe("LOCAL_FIXTURE=template\n");
  writeFileSync(target, "LOCAL_FIXTURE=preserve-existing\n");
  writeFileSync(join(checkout.root, "apps/web/.env.example"), "LOCAL_FIXTURE=replacement\n");
  const second = invoke(checkout, ["setup"]);
  expect(second.status).toBe(0);
  expect(second.stdout).toContain("already exists");
  expect(second.stderr).toBe("");
  expect(readFileSync(target, "utf8")).toBe("LOCAL_FIXTURE=preserve-existing\n");
  expect(existsSync(join(checkout.cwd, ".env"))).toBe(false);
  expect(existsSync(join(checkout.root, "node_modules"))).toBe(false);
});

test.skipIf(process.platform === "win32")(
  "the Bun entry follows its repository through an external symlink",
  () => {
    const checkout = fixture();
    const target = join(checkout.root, "scripts/bin/raypx.ts");
    const alias = join(checkout.cwd, "raypx.ts");
    symlinkSync(target, alias);
    const result = spawnSync("bun", ["--no-env-file", "--no-install", alias, "setup"], {
      cwd: checkout.cwd,
      env: environment,
      encoding: "utf8",
      timeout: 10_000,
    });
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Created apps/web/.env");
    expect(result.stderr).toBe("");
    expect(readFileSync(join(checkout.root, "apps/web/.env"), "utf8")).toBe(
      "LOCAL_FIXTURE=template\n",
    );
    expect(existsSync(join(checkout.cwd, "apps/web"))).toBe(false);
    expect(existsSync(join(checkout.root, "node_modules"))).toBe(false);
  },
);

test("env checks the actual tool versions in a dependency-free checkout", () => {
  const checkout = fixture();
  const result = invoke(checkout, ["env"]);
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Development environment passed");
  expect(result.stdout).toContain(`Node.js v${process.versions.node}`);
  expect(result.stderr).toBe("");
  expectNoBootstrapWrites(checkout.root);
});

test("env retains a failing exit code for version declarations and inherited package manager checks", () => {
  const checkout = fixture();
  writeFileSync(join(checkout.root, ".node-version"), "invalid\n");
  const invalidDeclaration = invoke(checkout, ["env"]);
  expect(invalidDeclaration.status).toBe(1);
  expect(invalidDeclaration.stderr).toContain("Development environment check failed");
  expect(invalidDeclaration.stderr).toContain(".node-version");
  writeFileSync(join(checkout.root, ".node-version"), process.versions.node);
  const invalidManager = invoke(checkout, ["env"], { npm_config_user_agent: "npm/11.0.0" });
  expect(invalidManager.status).toBe(1);
  expect(invalidManager.stderr).toContain("Package manager: expected bun, found npm");
  expectNoBootstrapWrites(checkout.root);
});
