import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, vi } from "vite-plus/test";
import { run } from "../lib/process.ts";
import { verifyGates } from "../lib/verify/gates.ts";
import { runVerify, type VerifyDependencies } from "../lib/verify/run.ts";

test("the Knip gate runs its installed CLI despite a local knip.ts and detects real unused files", async () => {
  const directory = await mkdtemp(join(tmpdir(), "raypx-verify-knip-"));
  try {
    const repository = fileURLToPath(new URL("../../", import.meta.url));
    await symlink(join(repository, "node_modules"), join(directory, "node_modules"), "junction");
    await writeFile(
      join(directory, "package.json"),
      JSON.stringify({ private: true, type: "module" }),
    );
    await writeFile(
      join(directory, "knip.ts"),
      'export default { entry: ["main.ts"], project: ["**/*.ts"], ignore: ["knip.ts"] };',
    );
    await writeFile(join(directory, "main.ts"), 'console.log("active entry");');
    await writeFile(join(directory, "unused.ts"), "export const abandoned = true;");
    const gate = verifyGates.find((candidate) => candidate.id === "knip");
    if (!gate) throw new Error("Knip verification gate is missing");
    const dependencies: VerifyDependencies = {
      repositoryRoot: directory,
      environment: { PATH: process.env.PATH, NODE_ENV: undefined },
      runCommand: run,
      runConsumers: async () => undefined,
      now: () => performance.now(),
      log: vi.fn<VerifyDependencies["log"]>(),
      output: vi.fn<VerifyDependencies["output"]>(),
    };
    const unused = await runVerify(dependencies, { gates: [gate] });
    expect(unused.ok).toBe(false);
    expect(unused.stages[0]).toMatchObject({ id: "knip", status: "failed" });
    expect(unused.stages[0]?.failure).toContain("unused.ts");
    await rm(join(directory, "unused.ts"));
    const clean = await runVerify(dependencies, { gates: [gate] });
    expect(clean.ok).toBe(true);
    expect(clean.stages[0]?.status).toBe("passed");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}, 20_000);
