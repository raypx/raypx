import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

it("requires mapped browser and confirmed input focus before reporting a graphical session ready", () => {
  const result = spawnSync(
    "python3",
    ["-B", fileURLToPath(new URL("../tests/screen_test.py", import.meta.url))],
    {
      encoding: "utf8",
      timeout: 10_000,
    },
  );
  expect(result.error).toBeUndefined();
  expect(result.stderr).not.toContain("FAILED");
  expect(result.status).toBe(0);
});
