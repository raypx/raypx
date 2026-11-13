import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";
it("confines the real image file helper with directory FDs, including symlinks and special files", () => {
  const result = spawnSync(
    "python3",
    ["-B", fileURLToPath(new URL("../tests/home_test.py", import.meta.url))],
    { encoding: "utf8", timeout: 10_000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.stderr).not.toContain("FAILED");
  expect(result.status).toBe(0);
});
