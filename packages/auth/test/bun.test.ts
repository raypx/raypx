import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

test("Bun native SQLite supports migrations, transactions, registration, login and logout", () => {
  const fixture = fileURLToPath(new URL("./fixtures/bun-flow.ts", import.meta.url));
  const result = spawnSync("bun", [fixture], {
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", LOG_LEVEL: "silent" },
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Bun SQLite auth flow passed");
});
