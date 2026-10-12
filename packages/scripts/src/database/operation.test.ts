import { describe, expect, it, vi } from "vite-plus/test";

import { getDatabaseScriptsEnv } from "../env.js";
import {
  databaseUrl,
  databaseEnvironment as environment,
  user,
  userRepository,
} from "../test-fixtures.js";
import { runClean, runMigrate, runPush, runSeed, runStudio } from "./operation.js";

describe("database commands", () => {
  it("requires DATABASE_URL before migrations can be configured", () => {
    vi.stubEnv("DATABASE_URL", undefined);

    expect(() => getDatabaseScriptsEnv({ NODE_ENV: "test" })).toThrow(
      "DATABASE_URL: Invalid input: expected string, received undefined",
    );

    vi.unstubAllEnvs();
  });

  it.each([
    ["migrates", runMigrate],
    ["cleans", runClean],
  ])("%s the configured database", async (_name, run) => {
    const operation = vi.fn(async () => undefined);
    await run(environment(), { migrate: operation, reset: operation, log: vi.fn() });
    expect(operation).toHaveBeenCalledWith(databaseUrl);
  });

  it("seeds users and always closes the connection", async () => {
    const save = vi.fn(async () => undefined);
    const users = userRepository({ save });
    const close = vi.fn(async () => undefined);
    const ensureAdmin = vi.fn(async () => user({ id: "admin-id" }));

    await runSeed(environment(), {
      createAdministration: () => ({ ensureAdmin }),
      log: vi.fn(),
      now: () => new Date("2026-02-01T00:00:00.000Z"),
      openUsers: () => ({ users, close }),
      uuidv7: () => "local-user-id",
    });

    expect(ensureAdmin).toHaveBeenCalledWith({
      email: "owner@voidmix.local",
      displayName: "Local Owner",
    });
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ id: "local-user-id", email: "user@voidmix.local" }),
    );
    expect(close).toHaveBeenCalledOnce();
  });

  it("closes the seed connection after failures", async () => {
    const close = vi.fn(async () => undefined);

    await expect(
      runSeed(environment(), {
        createAdministration: () => ({
          ensureAdmin: vi.fn(async () => {
            throw new Error("seed failed");
          }),
        }),
        log: vi.fn(),
        now: () => new Date(),
        openUsers: () => ({ users: userRepository(), close }),
        uuidv7: () => "id",
      }),
    ).rejects.toThrow("seed failed");
    expect(close).toHaveBeenCalledOnce();
  });

  it("restricts clean, seed, push, and studio to development or test", async () => {
    const production = environment({ NODE_ENV: "production" });
    const runCommand = vi.fn(async () => undefined);
    const reset = vi.fn(async () => undefined);

    await expect(runClean(production, { reset, log: vi.fn() })).rejects.toThrow(
      "db clean is restricted",
    );
    await expect(
      runSeed(production, {
        createAdministration: () => ({ ensureAdmin: vi.fn() }),
        log: vi.fn(),
        now: () => new Date(),
        openUsers: vi.fn(),
        uuidv7: () => "id",
      }),
    ).rejects.toThrow("db seed is restricted");
    await expect(
      runPush(production, { log: vi.fn(), processEnv: {}, repositoryRoot: "/repo", runCommand }),
    ).rejects.toThrow("db push is restricted");
    await expect(
      runStudio(production, {
        log: vi.fn(),
        processEnv: {},
        repositoryRoot: "/repo",
        runCommand,
      }),
    ).rejects.toThrow("db studio is restricted");
    expect(runCommand).not.toHaveBeenCalled();
    expect(reset).not.toHaveBeenCalled();
  });

  it.each([
    ["push", runPush, ["--hints", "[]"]],
    ["studio", runStudio, []],
  ] as const)(
    "runs Drizzle %s with repository environment and extra flags",
    async (command, run, flags) => {
      const runCommand = vi.fn(async () => undefined);
      const processEnv = { DATABASE_URL: databaseUrl };
      await run(environment(), { log: vi.fn(), processEnv, repositoryRoot: "/repo", runCommand }, [
        ...flags,
      ]);
      expect(runCommand).toHaveBeenCalledWith(
        ["bun", "run", "drizzle-kit", command, "--config", "drizzle.config.ts", ...flags],
        { cwd: "/repo/packages/db", env: processEnv },
      );
    },
  );
});
