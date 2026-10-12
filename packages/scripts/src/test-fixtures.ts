import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { User, UserRepository } from "@voidmix/core";
import { getDatabaseScriptsEnv } from "./env.js";
import { vi, onTestFinished, expect } from "vite-plus/test";

/** Isolated files for CLI tests, removed even when an assertion fails. */
export async function temporaryRepository(files: Record<string, string> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "voidmix-test-"));
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

export const databaseUrl = "postgres://voidmix:voidmix@localhost:5432/voidmix";

export function databaseEnvironment(overrides: Record<string, string> = {}) {
  return getDatabaseScriptsEnv({
    NODE_ENV: "test",
    DATABASE_URL: databaseUrl,
    ...overrides,
  });
}

export function user(overrides: Partial<User> = {}): User {
  return {
    id: "user-id",
    email: "owner@voidmix.local",
    displayName: "Owner",
    role: "admin",
    status: "active",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

export function userRepository(overrides: Partial<UserRepository> = {}): UserRepository {
  const repository: UserRepository = {
    runAdministration: async (operation) => operation(repository),
    list: vi.fn(async () => ({ items: [], total: 0, nextCursor: null })),
    getById: vi.fn(async () => null),
    getByEmail: vi.fn(async () => null),
    countActiveAdministrators: vi.fn(async () => 1),
    save: vi.fn(async () => undefined),
    updateStatus: vi.fn(async () => user()),
    appendAudit: vi.fn(async () => undefined),
    listAudit: vi.fn(async () => []),
    ...overrides,
  };
  return repository;
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
