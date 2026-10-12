import { temporaryRepository } from "../test-fixtures.js";

import { describe, expect, it } from "vite-plus/test";

import { createCommandContext } from "./context.js";
import { REPOSITORY_ENV_KEY, resolveProcessEnvironment } from "./env.js";

const environmentFiles = {
  ".env": "FILE_VALUE=base\nDATABASE_URL=postgresql://voidmix:voidmix@localhost:5432/voidmix\n",
  ".env.local": "FILE_VALUE=local\n",
};

describe("command environment policies", () => {
  it("does not read repository files for the process policy", async () => {
    const root = await temporaryRepository(environmentFiles);
    const input = { NODE_ENV: "test", PROCESS_VALUE: "process" };

    const result = resolveProcessEnvironment("process", {
      processEnv: input,
      repositoryRoot: root,
    });

    expect(result).toEqual(input);
    expect(result).not.toHaveProperty("FILE_VALUE");
    expect(result).not.toHaveProperty(REPOSITORY_ENV_KEY);
    expect(input).toEqual({ NODE_ENV: "test", PROCESS_VALUE: "process" });
  });

  it("loads repository files without mutating the input", async () => {
    const root = await temporaryRepository(environmentFiles);
    const input = { NODE_ENV: "test" };

    const result = resolveProcessEnvironment("repository", {
      processEnv: input,
      repositoryRoot: root,
    });

    expect(result).toMatchObject({
      FILE_VALUE: "local",
      NODE_ENV: "test",
      [REPOSITORY_ENV_KEY]: root,
    });
    expect(input).toEqual({ NODE_ENV: "test" });
  });

  it("validates the database environment after loading repository files", async () => {
    const root = await temporaryRepository(environmentFiles);

    const context = createCommandContext("database", {
      processEnv: { NODE_ENV: "test" },
      repositoryRoot: root,
    });

    expect(context.environment.DATABASE_URL).toBe(
      "postgresql://voidmix:voidmix@localhost:5432/voidmix",
    );
    expect(context.processEnv.FILE_VALUE).toBe("local");
    expect(context.repositoryRoot).toBe(root);
  });
});
