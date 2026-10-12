import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getDatabaseScriptsEnv } from "./env.js";
import { vi, onTestFinished, expect } from "vite-plus/test";

/** Isolated files for CLI tests, removed even when an assertion fails. */
export async function temporaryRepository(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "raypx-test-"));
  onTestFinished(() => rm(root, { recursive: true, force: true }));
  await Promise.all(
    Object.entries(files).map(async ([path, content]) => {
      const target = join(root, path);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content);
    }),
  );
  return root;
}

export const databaseUrl = "postgres://raypx:raypx@localhost:5432/raypx";

export function databaseEnvironment(overrides: Record<string, string> = {}) {
  return getDatabaseScriptsEnv({
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    ...overrides,
  });
}

/** Assert both finding cardinality and its stable diagnostic fields. */
export function expectOnlyFinding(findings: readonly unknown[], expected: object) {
  expect(findings).toHaveLength(1);
  expect(findings[0]).toMatchObject(expected);
}

export function processDependencies() {
  return {
    log: vi.fn(),
    runCommand: vi.fn<
      import("./runtime/process-dependencies.js").RepositoryProcessDependencies["runCommand"]
    >(async () => undefined),
    processEnv: { TEST_VALUE: "value" },
    repositoryRoot: "/repo",
  };
}
