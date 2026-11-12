import { globSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";
import repository from "./package.json" with { type: "json" };
import defaults from "./test.config.js";

const root = fileURLToPath(new URL(".", import.meta.url));

export default mergeConfig(
  defaults,
  defineConfig({
    test: {
      projects: globSync(
        repository.workspaces.packages.map((workspace) => `${workspace}/vitest.config.ts`),
        { cwd: root },
      ).sort(),
    },
  }),
);
