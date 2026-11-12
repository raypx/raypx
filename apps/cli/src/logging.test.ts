import { expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

it("keeps UUID diagnostic correlation while redacting numeric credentials and private fields", () => {
  const id = "20492314-5071-4207-8464-291856f575df";
  const source = `
import { createCliLogging } from ${JSON.stringify(pathToFileURL(resolve(import.meta.dirname, "logging.ts")).href)};
const logger = await createCliLogging();
logger.record({ operation: "job.completed", id: ${JSON.stringify(id)}, jobId: ${JSON.stringify(id)}, status: "success", exitCode: 0, elapsedMs: 1 });
logger.record({ operation: "job.completed", id: "4111 1111 1111 1111", jobId: "private-person@example.com", status: "success", exitCode: 0, elapsedMs: 1, token: "private-credential", prompt: "private-prompt" });
await logger.close();
`;
  const child = Bun.spawnSync([process.execPath, "-e", source], {
    env: { ...process.env, BUN_BE_BUN: "1" },
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(child.exitCode).toBe(0);
  const output = child.stderr.toString();
  const rows = output
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  expect(rows[0].id).toBe(id);
  expect(rows[0].jobId).toBe(id);
  for (const secret of [
    "4111 1111 1111 1111",
    "private-person@example.com",
    "private-credential",
    "private-prompt",
  ])
    expect(output).not.toContain(secret);
});
