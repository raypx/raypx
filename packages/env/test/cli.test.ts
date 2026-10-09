import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "vite-plus/test";

const cliPath = fileURLToPath(new URL("../src/cli.ts", import.meta.url));

function runCheck(values: Record<string, string>) {
  return spawnSync("bun", ["--no-env-file", cliPath], {
    encoding: "utf8",
    env: {
      PATH: process.env.PATH,
      NODE_ENV: "production",
      HOST: "127.0.0.1",
      PORT: "3000",
      ...values,
    },
    timeout: 10_000,
  });
}

test("validates configuration without displaying supplied values", () => {
  const version = "private-version-sentinel";
  const result = runCheck({ APP_VERSION: version });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  expect(result.stdout).toBe("Runtime environment is valid.\n");
  expect(`${result.stdout}${result.stderr}`).not.toContain(version);
});

test("exits unsuccessfully with a sanitized error for an invalid listener override", () => {
  const secret = "private-override-sentinel";
  const result = runCheck({ NITRO_PORT: secret });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("NITRO_PORT: must be an integer between 1 and 65535");
  expect(`${result.stdout}${result.stderr}`).not.toContain(secret);
});
