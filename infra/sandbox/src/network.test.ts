import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("durably reserves byte allowances, fences UTC rollover and refuses missing host policy", () => {
  const result = spawnSync(
    "python3",
    ["-B", fileURLToPath(new URL("../tests/network_test.py", import.meta.url))],
    { encoding: "utf8", timeout: 10000 },
  );
  expect(result.stderr).not.toContain("FAILED");
  expect(result.status).toBe(0);
});
