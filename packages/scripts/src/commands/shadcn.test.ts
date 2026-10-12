import { processDependencies, temporaryRepository } from "../test-fixtures.js";
import { join } from "node:path";

import { describe, expect, it, vi } from "vite-plus/test";

import { readShadcnComponents, runShadcnUpdate } from "./shadcn.js";

async function manifestFixture(content: string) {
  return join(
    await temporaryRepository({ "shadcn-components.json": content }),
    "shadcn-components.json",
  );
}

describe("readShadcnComponents", () => {
  it("returns the tracked component names", async () => {
    const filePath = await manifestFixture(JSON.stringify({ components: ["button", "avatar"] }));

    await expect(readShadcnComponents(filePath)).resolves.toEqual(["button", "avatar"]);
  });

  it.each([
    ["no components", []],
    ["a non-string entry", ["button", 42]],
  ])("rejects a manifest with %s", async (_name, components) => {
    const filePath = await manifestFixture(JSON.stringify({ components }));
    await expect(readShadcnComponents(filePath)).rejects.toThrow(/at least one component/);
  });
});

describe("runShadcnUpdate", () => {
  it("runs shadcn add for every tracked component", async () => {
    const dependencies = {
      ...processDependencies(),
      readComponents: vi.fn(async () => ["button", "avatar"]),
    };

    await runShadcnUpdate(dependencies);

    expect(dependencies.readComponents).toHaveBeenCalledWith(
      "/repo/packages/ui/shadcn-components.json",
    );
    expect(dependencies.runCommand).toHaveBeenCalledWith(
      [
        "bunx",
        "shadcn@latest",
        "add",
        "button",
        "avatar",
        "--yes",
        "--overwrite",
        "--cwd",
        "packages/ui",
      ],
      { cwd: "/repo", env: dependencies.processEnv },
    );
  });
});
