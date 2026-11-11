import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "bun:test";
import { stubEnv } from "../../tests/helpers/stubs.ts";
import { workspaceFixtures } from "../../tests/helpers/workspace.ts";
import { cacheSnapshot } from "./cache.ts";

const { fixture } = workspaceFixtures();

it("saves log-only VP results and skips an unchanged cache after a hit", async () => {
  const root = fixture();
  const cache = join(root, "node_modules/.vite/task-cache/v18");
  const output = join(root, "outputs");
  stubEnv("GITHUB_OUTPUT", output);

  await cacheSnapshot(root, "snapshot");
  mkdirSync(cache, { recursive: true });
  writeFileSync(join(cache, "cache.db"), "cached task logs");
  await cacheSnapshot(root, "changed");

  await cacheSnapshot(root, "snapshot");
  writeFileSync(join(cache, "last-summary.json"), '{"tasks":[]}');
  await cacheSnapshot(root, "changed");

  expect(readFileSync(output, "utf8")).toBe("changed=true\nchanged=false\n");
});
