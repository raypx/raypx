import { execFileSync, spawnSync } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, expect, test } from "vite-plus/test";
import { runPolicy } from "../lib/policy/checks.ts";
import type { PolicyReport } from "../lib/policy/report.ts";

const directories: string[] = [];
const repository = fileURLToPath(new URL("../../", import.meta.url));

async function temporaryDirectory() {
  const directory = await mkdtemp(join(tmpdir(), "raypx-policy-"));
  directories.push(directory);
  return directory;
}

async function put(root: string, path: string, value: string | Record<string, unknown>) {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), typeof value === "string" ? value : JSON.stringify(value));
}

async function fixture() {
  const root = await temporaryDirectory();
  execFileSync("git", ["init", "--quiet"], { cwd: root });
  await put(root, ".gitignore", "node_modules/\ndist/\n.env*\napps/ignored/\n");
  await put(root, "package.json", {
    name: "fixture",
    version: "0.1.0",
    type: "module",
    workspaces: { packages: ["apps/*", "packages/*"] },
  });
  await put(root, "packages/config/package.json", {
    name: "@raypx/config",
    exports: {
      "./tsconfig/*.json": "./tsconfig-presets/*.json",
      "./tsconfig-presets/*.json": "./tsconfig-presets/*.json",
    },
  });
  await put(root, "packages/config/tsconfig-presets/base.json", {
    compilerOptions: { strict: true },
  });
  await put(root, "packages/config/tsconfig-presets/node.json", { extends: "./base.json" });
  await put(root, "packages/config/tsconfig.json", { extends: "./tsconfig.test.json" });
  await put(root, "packages/config/tsconfig.test.json", {
    extends: "@raypx/config/tsconfig/node.json",
  });
  await put(root, "apps/web/package.json", { name: "@raypx/web" });
  await put(
    root,
    "apps/web/tsconfig.json",
    '{ // JSONC remains valid\n"extends":"@raypx/config/tsconfig-presets/base.json", "compilerOptions":{"noEmit":true},\n}',
  );
  await put(root, "scripts/tsconfig.json", { extends: "@raypx/config/tsconfig/node.json" });
  await put(root, "docs/INDEX.md", "[Guide](guide.md)\n[Spaces](<guide with space.md>)\n");
  await put(root, "docs/guide with space.md", "# Guide with a space\n");
  await put(root, "docs/guide.md", "[Root][root]\n\n[root]: ../package.json\n");
  return root;
}

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

test("accepts JSONC, relative inheritance, both public aliases, arrays and intentional overrides without writes", async () => {
  const root = await fixture();
  await put(root, "apps/web/tsconfig.check.json", {
    extends: ["./tsconfig", "@raypx/config/tsconfig/base.json"],
    compilerOptions: { lib: ["DOM"] },
  });
  await put(root, "packages/config/tsconfig-presets/tsconfig.base.json", {
    compilerOptions: { strict: true },
  });
  const before = await readFile(join(root, "apps/web/tsconfig.json"), "utf8");
  const status = () =>
    execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" });
  const originalStatus = status();
  expect(await runPolicy(root)).toEqual({ findings: [], errors: 0 });
  expect(await readFile(join(root, "apps/web/tsconfig.json"), "utf8")).toBe(before);
  expect(status()).toBe(originalStatus);
});

test("reports missing, malformed, unnamed and duplicate workspace manifests plus root coverage", async () => {
  const root = await fixture();
  await put(root, "package.json", { name: "fixture", workspaces: ["packages/*"] });
  await put(root, "apps/missing/source.ts", "export {};");
  await put(root, "packages/malformed/package.json", "{");
  await put(root, "packages/unnamed/package.json", {});
  await put(root, "packages/duplicate/package.json", { name: "@raypx/web" });
  const report = await runPolicy(root);
  expect(report.findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ rule: "workspace.coverage", path: "apps/web/package.json" }),
      expect.objectContaining({ rule: "workspace.manifest", path: "apps/missing/package.json" }),
      expect.objectContaining({
        rule: "workspace.manifest",
        path: "packages/malformed/package.json",
      }),
      expect.objectContaining({ rule: "workspace.name", path: "packages/unnamed/package.json" }),
      expect.objectContaining({ rule: "workspace.name", path: "packages/duplicate/package.json" }),
    ]),
  );
  expect(await runPolicy(root)).toEqual(report);
  expect(report.errors).toBe(report.findings.length);
});

test("honors workspace exclusions and ignores generated, dependency and env content", async () => {
  const root = await fixture();
  await put(root, "package.json", {
    name: "fixture",
    workspaces: ["apps/*", "packages/*", "!packages/excluded"],
  });
  await put(root, "packages/excluded/package.json", { name: "@raypx/excluded" });
  await put(root, "apps/ignored/package.json", "{");
  await put(root, "node_modules/broken/README.md", "[Broken](absent.md)");
  await put(root, "dist/README.md", "[Broken](absent.md)");
  await put(root, "docs/.env.md", "[Broken](absent.md)");
  const report = await runPolicy(root);
  expect(report.findings).toEqual([
    expect.objectContaining({ rule: "workspace.coverage", path: "packages/excluded/package.json" }),
  ]);
});

test("reports missing and cyclic TypeScript bases, malformed JSONC, unexported presets and absent inheritance", async () => {
  const root = await fixture();
  await put(root, "apps/web/tsconfig.missing.json", { extends: "./absent.json" });
  await put(root, "apps/web/tsconfig.a.json", { extends: "./tsconfig.b.json" });
  await put(root, "apps/web/tsconfig.b.json", { extends: "./tsconfig.a.json" });
  await put(root, "apps/web/tsconfig.invalid.json", "{]");
  await put(root, "apps/web/tsconfig.private.json", { extends: "@raypx/config/internal.json" });
  await put(root, "apps/web/tsconfig.bare.json", {});
  const report = await runPolicy(root);
  expect(report.findings).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ rule: "tsconfig.missing", path: "apps/web/absent.json" }),
      expect.objectContaining({ rule: "tsconfig.cycle", path: "apps/web/tsconfig.a.json" }),
      expect.objectContaining({ rule: "tsconfig.json", path: "apps/web/tsconfig.invalid.json" }),
      expect.objectContaining({ rule: "tsconfig.extends", path: "apps/web/tsconfig.private.json" }),
      expect.objectContaining({ rule: "tsconfig.preset", path: "apps/web/tsconfig.bare.json" }),
    ]),
  );
});

test("resolves public presets through the actual export map and rejects traversal", async () => {
  const root = await fixture();
  await put(root, "packages/config/package.json", {
    name: "@raypx/config",
    exports: {
      "./tsconfig/*.json": "./presets/*.json",
      "./tsconfig-presets/*.json": "./presets/*.json",
    },
  });
  await put(root, "packages/config/presets/base.json", { compilerOptions: { strict: true } });
  await put(root, "packages/config/presets/node.json", { extends: "./base.json" });
  await put(root, "packages/config/presets/tsconfig.base.json", {
    compilerOptions: { strict: true },
  });
  expect(await runPolicy(root)).toEqual({ findings: [], errors: 0 });
  await put(root, "apps/web/tsconfig.json", {
    extends: "@raypx/config/tsconfig/../../package.json",
  });
  expect((await runPolicy(root)).findings).toEqual([
    expect.objectContaining({ rule: "tsconfig.extends", path: "apps/web/tsconfig.json" }),
  ]);
});

test("honors exact and most-specific preset exports without fallback after a blocked mapping", async () => {
  const root = await fixture();
  await put(root, "packages/config/package.json", {
    name: "@raypx/config",
    exports: {
      "./tsconfig/*.json": "./tsconfig-presets/*.json",
      "./tsconfig-presets/*.json": "./tsconfig-presets/*.json",
      "./tsconfig/node.json": null,
      "./tsconfig/blocked-*.json": null,
      "./tsconfig/invalid.json": { types: null, default: "./tsconfig-presets/base.json" },
    },
  });
  await put(root, "scripts/tsconfig.json", { extends: "@raypx/config/tsconfig/base.json" });
  await put(root, "packages/config/tsconfig.test.json", {
    extends: "@raypx/config/tsconfig/base.json",
  });
  await put(root, "packages/config/tsconfig-presets/blocked-base.json", {});
  await put(root, "apps/web/tsconfig.exact.json", { extends: "@raypx/config/tsconfig/node.json" });
  await put(root, "apps/web/tsconfig.pattern.json", {
    extends: "@raypx/config/tsconfig/blocked-base.json",
  });
  await put(root, "apps/web/tsconfig.invalid.json", {
    extends: "@raypx/config/tsconfig/invalid.json",
  });
  expect((await runPolicy(root)).findings).toEqual([
    expect.objectContaining({ rule: "tsconfig.extends", path: "apps/web/tsconfig.exact.json" }),
    expect.objectContaining({ rule: "tsconfig.extends", path: "apps/web/tsconfig.invalid.json" }),
    expect.objectContaining({ rule: "tsconfig.extends", path: "apps/web/tsconfig.pattern.json" }),
  ]);
});

test("validates inline, image and reference links while ignoring fenced/inline code, external URLs and anchors", async () => {
  const root = await fixture();
  await put(
    root,
    "docs/guide.md",
    [
      "[Valid](../package.json#name) [Space](guide%20with%20space.md)",
      "[External](https://example.invalid/missing) [Mail](mailto:a@example.invalid) [Anchor](#unknown)",
      "`[Inline example](missing-inline.md)`",
      "```md",
      "[Fenced](missing-fenced.md)",
      "```",
      "    [Indented code](missing-indented.md)",
      "<!-- [Comment](missing-comment.md) -->",
      "[Reference][existing] [Collapsed][] [Shortcut]",
      "[existing]: ../package.json",
      "[Collapsed]: ../package.json",
      "[Shortcut]: ../package.json",
    ].join("\n"),
  );
  expect(await runPolicy(root)).toEqual({ findings: [], errors: 0 });
  await put(
    root,
    "docs/guide.md",
    "[Broken](missing.md) ![Image](absent.png) [Ref][bad]\n\n[bad]: no.md\n",
  );
  const report = await runPolicy(root);
  expect(report.findings).toHaveLength(3);
  expect(
    report.findings.every(
      (finding) => finding.rule === "docs.link" && finding.path === "docs/guide.md",
    ),
  ).toBe(true);
});

test("requires docs INDEX and transitive navigation for tracked and untracked documents", async () => {
  const root = await fixture();
  execFileSync("git", ["add", "docs/guide.md", "docs/INDEX.md"], { cwd: root });
  await put(root, "docs/orphan.md", "# Orphan\n");
  expect((await runPolicy(root)).findings).toEqual([
    expect.objectContaining({ rule: "docs.index", path: "docs/orphan.md" }),
  ]);
  await put(root, "docs/guide.md", "[Orphan](orphan.md)");
  expect((await runPolicy(root)).errors).toBe(0);
  await rm(join(root, "docs/INDEX.md"));
  expect((await runPolicy(root)).findings).toEqual([
    expect.objectContaining({ rule: "docs.index", path: "docs/INDEX.md" }),
  ]);
});

test("checks both destinations in a linked image and follows its outer documentation link", async () => {
  const root = await fixture();
  await put(root, "docs/image.svg", "<svg />");
  await put(root, "docs/nested.md", "# Nested\n");
  await put(root, "docs/guide.md", "[![Image](image.svg)](nested.md)");
  expect(await runPolicy(root)).toEqual({ findings: [], errors: 0 });
  await put(root, "docs/guide.md", "[![Image](image.svg)](missing.md)");
  const report = await runPolicy(root);
  expect(report.findings).toEqual([
    expect.objectContaining({
      rule: "docs.link",
      path: "docs/guide.md",
      message: expect.stringContaining("missing.md"),
    }),
    expect.objectContaining({ rule: "docs.index", path: "docs/nested.md" }),
  ]);
  await put(root, "docs/guide.md", "[![Image](missing.svg)](nested.md)");
  expect((await runPolicy(root)).findings).toEqual([
    expect.objectContaining({
      rule: "docs.link",
      path: "docs/guide.md",
      message: expect.stringContaining("missing.svg"),
    }),
  ]);
});

test.skipIf(process.platform === "win32")(
  "never reads linked content or local links outside the repository",
  async () => {
    const root = await fixture();
    const outside = await temporaryDirectory();
    await put(outside, "config.json", { extends: "../secret.json" });
    await symlink(join(outside, "config.json"), join(root, "apps/web/tsconfig.outside.json"));
    await put(root, "docs/guide.md", "[Outside](../../outside.json)\n");
    const report = await runPolicy(root);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "tsconfig.missing",
          path: "apps/web/tsconfig.outside.json",
        }),
        expect.objectContaining({ rule: "docs.link", path: "docs/guide.md" }),
      ]),
    );
  },
);

async function installCli(root: string) {
  for (const path of [
    "scripts/bin/raypx.ts",
    "scripts/cli.ts",
    "scripts/commands/policy.ts",
    "scripts/lib/cli/bootstrap.ts",
    "scripts/lib/logger.ts",
    "scripts/lib/consumer/cli.ts",
    "scripts/lib/doctor/report.ts",
    "scripts/lib/policy",
  ]) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await cp(join(repository, path), join(root, path), { recursive: true });
  }
  await symlink(join(repository, "node_modules"), join(root, "node_modules"), "junction");
}

function invoke(root: string, args: string[]) {
  const result = spawnSync(
    "bun",
    ["--no-env-file", "--no-install", join(root, "scripts/bin/raypx.ts"), "policy", ...args],
    {
      cwd: root,
      encoding: "utf8",
      timeout: 5000,
      env: { PATH: process.env.PATH, NODE_ENV: "test", CI: "true" },
    },
  );
  expect(result.error).toBeUndefined();
  return result;
}

test("real policy CLI returns text/JSON parity, exit 0/1 and leaves repository sources unchanged", async () => {
  const root = await fixture();
  await installCli(root);
  const clean = invoke(root, ["--json"]);
  expect(clean.status).toBe(0);
  expect(clean.stderr).toBe("");
  expect(JSON.parse(clean.stdout)).toEqual({ findings: [], errors: 0 });
  await put(root, "docs/guide.md", "[Broken](absent.md)");
  const before = await readFile(join(root, "docs/guide.md"), "utf8");
  const expected = await runPolicy(root);
  const json = invoke(root, ["--json"]);
  expect(json.status).toBe(1);
  expect(json.stderr).toBe("");
  expect(JSON.parse(json.stdout)).toEqual(expected);
  const text = invoke(root, []);
  expect(text.status).toBe(1);
  expect(text.stderr).toBe("");
  for (const finding of expected.findings)
    expect(text.stdout).toContain(`${finding.path} [${finding.rule}] ${finding.message}`);
  expect(await readFile(join(root, "docs/guide.md"), "utf8")).toBe(before);
});

test("real policy CLI keeps runtime inspection failures machine-readable", async () => {
  const root = await fixture();
  await installCli(root);
  await rm(join(root, ".git"), { recursive: true });
  const result = invoke(root, ["--json"]);
  expect(result.status).toBe(1);
  expect(result.stderr).toBe("");
  const report = JSON.parse(result.stdout) as PolicyReport;
  expect(report.errors).toBe(1);
  expect(report.findings[0]?.rule).toBe("policy.runtime");
});
