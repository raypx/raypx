import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vite-plus/test";
import { Evidence, type ValidationProcess } from "../../src/validation/evidence.js";
import { workspaceFixtures } from "../helpers/workspace.js";

const { fixture } = workspaceFixtures();

it("stops owned background processes after a failed gate and keeps argv/environment out of the run manifest", async () => {
  const evidence = new Evidence(fixture(), "validation");
  let service: ValidationProcess | undefined;
  await expect(
    evidence.run(async () => {
      service = evidence.start("service", [
        process.execPath,
        "--eval",
        "setInterval(() => {}, 1000)",
      ]);
      await evidence.command(
        "failed-gate",
        [process.execPath, "--eval", "process.exit(7)", "private-argument"],
        { ...process.env, PRIVATE_TOKEN: "private-token" },
      );
    }),
  ).rejects.toThrow("failed-gate failed (7)");
  expect(service?.alive()).toBe(false);
  const manifest = readFileSync(join(evidence.directory, "commands.json"), "utf8");
  expect(JSON.parse(manifest)).toEqual(
    expect.arrayContaining([expect.objectContaining({ label: "failed-gate", code: 7 })]),
  );
  expect(manifest).not.toMatch(/private-argument|private-token/);
});

it("truncates reused log files so shorter diagnostics never expose stale trailing output", async () => {
  const evidence = new Evidence(fixture(), "validation");
  await evidence.run(async () => {
    await evidence.command("log", [
      process.execPath,
      "--eval",
      'console.log("old diagnostics repeated repeatedly")',
    ]);
    await evidence.command("log", [process.execPath, "--eval", 'console.log("new")']);
  });
  expect(readFileSync(join(evidence.directory, "log.log"), "utf8")).toBe("new\n");
});
