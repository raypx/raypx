import { expect, test, vi } from "vite-plus/test";
import { verifyGates, type VerifyGate } from "../lib/verify/gates.ts";
import { runVerify, type VerifyDependencies } from "../lib/verify/run.ts";
import { createVerifyDependencies } from "../lib/verify/runtime.ts";
import { failureOutput } from "../lib/verify/report.ts";

function dependencies(environment: NodeJS.ProcessEnv = {}) {
  let clock = 0;
  return {
    repositoryRoot: "/fixture/raypx",
    environment,
    runCommand: vi.fn<VerifyDependencies["runCommand"]>(async () => "quiet successful output"),
    runConsumers: vi.fn<VerifyDependencies["runConsumers"]>(async () => undefined),
    now: () => clock++,
    log: vi.fn<VerifyDependencies["log"]>(),
    output: vi.fn<VerifyDependencies["output"]>(),
  };
}

test("runs every required gate once in order without recursively invoking check or consumer preparation", async () => {
  const deps = dependencies({
    PATH: "/fixture/bin",
    NODE_ENV: "production",
    CUSTOM_VALUE: "inherited",
  });
  const calls: string[] = [];
  deps.runCommand.mockImplementation(async (_command, args) => {
    calls.push(args.join(" "));
    return "output is hidden on success";
  });
  deps.runConsumers.mockImplementation(async () => {
    calls.push("prepared consumers");
  });
  const report = await runVerify(deps);
  expect(report.ok).toBe(true);
  expect(report.stages.map((stage) => stage.id)).toEqual([
    "env",
    "deps",
    "policy",
    "fmt",
    "boundaries",
    "knip",
    "build",
    "lint",
    "types:workspaces",
    "types:scripts",
    "tests:workspaces",
    "tests:scripts",
    "storybook",
    "consumer",
  ]);
  expect(calls).toEqual([
    "--no-env-file --no-install packages/config/src/environment.ts",
    "--no-env-file --no-install scripts/bin/raypx.ts deps",
    "--no-env-file --no-install scripts/bin/raypx.ts policy",
    "--no-env-file --no-install run vp fmt --check",
    "--no-env-file --no-install packages/config/src/check-boundaries.ts",
    "node_modules/knip/bin/knip.js --config knip.ts",
    "--no-env-file --no-install run vp run --filter @raypx/* build",
    "--no-env-file --no-install run vp lint --deny-warnings",
    "--no-env-file --no-install run vp run --filter @raypx/* typecheck",
    "--no-env-file --no-install run tsc -p scripts/tsconfig.json",
    "--no-env-file --no-install run vp run --filter @raypx/* test",
    "--no-env-file --no-install run vp test run --project scripts",
    "--no-env-file --no-install run vp run @raypx/ui#storybook-build",
    "prepared consumers",
  ]);
  expect(deps.runConsumers).toHaveBeenCalledOnce();
  expect(report.stages.every((stage) => stage.status === "passed" && stage.durationMs >= 0)).toBe(
    true,
  );
  expect(deps.output).not.toHaveBeenCalled();
  expect(deps.log.mock.calls.flat().join("\n")).not.toContain("quiet successful output");
  for (const [command, args, cwd, timeout, environment, options] of deps.runCommand.mock.calls) {
    const installedKnip = args[0] === "node_modules/knip/bin/knip.js";
    expect(command).toBe(installedKnip ? "node" : "bun");
    expect(installedKnip || args.includes("--no-install")).toBe(true);
    expect(installedKnip || args.includes("--no-env-file")).toBe(true);
    expect(cwd).toBe("/fixture/raypx");
    expect(timeout).toBeGreaterThanOrEqual(30_000);
    expect(environment).toEqual({
      PATH: "/fixture/bin",
      NODE_ENV: "production",
      CUSTOM_VALUE: "inherited",
    });
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.onOutput).toBeUndefined();
  }
});

test("preserves an unset NODE_ENV and snapshots the inherited environment across gates", async () => {
  const environment = { PATH: "/fixture/bin", CUSTOM_VALUE: "original" };
  const deps = dependencies(environment);
  deps.runCommand.mockImplementation(async () => {
    environment.CUSTOM_VALUE = "later mutation";
    return "";
  });
  await runVerify(deps);
  for (const call of deps.runCommand.mock.calls) {
    expect(call[4]).toEqual({
      PATH: "/fixture/bin",
      CUSTOM_VALUE: "original",
      NODE_ENV: undefined,
    });
    expect(Object.hasOwn(call[4] ?? {}, "NODE_ENV")).toBe(true);
  }
  const runtime = createVerifyDependencies("/fixture", environment);
  environment.CUSTOM_VALUE = "another mutation";
  expect(runtime.environment.CUSTOM_VALUE).toBe("later mutation");
  expect(Object.hasOwn(runtime.environment, "NODE_ENV")).toBe(true);
});

test("fails fast with a bounded redacted diagnostic and leaves later stages skipped", async () => {
  const secret = "private-verification-secret";
  const deps = dependencies({ BETTER_AUTH_SECRET: secret });
  deps.runCommand.mockImplementation(async (_command, args) => {
    if (args.includes("fmt"))
      throw new Error(
        `bun --no-env-file --no-install run vp fmt --check failed (1)\n${"earlier output\n".repeat(2000)}last failure ${secret}`,
      );
    return "";
  });
  const report = await runVerify(deps);
  expect(report.ok).toBe(false);
  expect(report.cancelled).toBe(false);
  expect(deps.runCommand).toHaveBeenCalledTimes(4);
  expect(deps.runConsumers).not.toHaveBeenCalled();
  expect(report.stages[3]).toMatchObject({ id: "fmt", status: "failed" });
  expect(report.stages.slice(4).every((stage) => stage.status === "skipped")).toBe(true);
  const failure = report.stages[3]?.failure ?? "";
  expect(failure).toContain("last failure [REDACTED]");
  expect(failure).not.toContain(secret);
  expect(failure.length).toBeLessThanOrEqual(8000);
  expect(failure.split("\n").length).toBeLessThanOrEqual(80);
  expect(deps.log.mock.calls.flat().join("\n")).not.toContain(secret);
  expect(deps.log).toHaveBeenCalledWith(
    "Command: bun --no-env-file --no-install run vp fmt --check",
  );
  expect(failure).not.toContain("--no-install run vp fmt --check");
});

test("verbose forwards both subprocess streams to the supplied output sink including the consumer scope", async () => {
  const deps = dependencies();
  deps.runCommand.mockImplementation(
    async (_command, _args, _cwd, _timeout, _environment, options) => {
      options?.onOutput?.("live stdout\n", "stdout");
      options?.onOutput?.("live stderr\n", "stderr");
      return "captured tail";
    },
  );
  deps.runConsumers.mockImplementation(async (options) => {
    options.onOutput?.("consumer output\n", "stdout");
  });
  const report = await runVerify(deps, { verbose: true });
  expect(report.ok).toBe(true);
  expect(deps.output).toHaveBeenCalledWith("live stdout\n", "stdout");
  expect(deps.output).toHaveBeenCalledWith("live stderr\n", "stderr");
  expect(deps.output).toHaveBeenCalledWith("consumer output\n", "stdout");
  expect(deps.log.mock.calls.flat().join("\n")).not.toContain("captured tail");
});

test("pre-cancellation runs no gate, while cancellation during a gate propagates and stops later work", async () => {
  const early = new AbortController();
  early.abort();
  const untouched = dependencies();
  const earlyReport = await runVerify(untouched, { signal: early.signal });
  expect(earlyReport.cancelled).toBe(true);
  expect(untouched.runCommand).not.toHaveBeenCalled();
  expect(untouched.runConsumers).not.toHaveBeenCalled();
  expect(earlyReport.stages.every((stage) => stage.status === "skipped")).toBe(true);

  const active = new AbortController();
  const deps = dependencies();
  deps.runCommand.mockImplementation(
    async (_command, _args, _cwd, _timeout, _environment, options) => {
      active.abort(new DOMException("cancelled", "AbortError"));
      options?.signal?.throwIfAborted();
      return "";
    },
  );
  const report = await runVerify(deps, { signal: active.signal });
  expect(report.cancelled).toBe(true);
  expect(report.stages[0]?.status).toBe("cancelled");
  expect(deps.runCommand).toHaveBeenCalledOnce();
  expect(deps.runConsumers).not.toHaveBeenCalled();
});

test("a consumer deadline cancels its inherited child scope and fails before the next gate", async () => {
  const deps = dependencies();
  deps.runConsumers.mockImplementation(
    (options) =>
      new Promise<void>((_resolve, reject) => {
        options.signal?.addEventListener("abort", () => reject(options.signal?.reason), {
          once: true,
        });
      }),
  );
  const gates: readonly VerifyGate[] = [
    { id: "consumer", label: "Consumer", kind: "consumer", timeoutMs: 5 },
    { id: "later", label: "Later", kind: "command", command: "bun", args: [], timeoutMs: 30_000 },
  ];
  const report = await runVerify(deps, { gates });
  expect(report.ok).toBe(false);
  expect(report.cancelled).toBe(false);
  expect(report.stages[0]?.failure).toContain("deadline");
  expect(report.stages[1]?.status).toBe("skipped");
  expect(deps.runCommand).not.toHaveBeenCalled();
});

test("failure reports remove URL credentials and terminal escapes without exposing environment values", () => {
  const output = failureOutput(
    new Error("\u001b[31mfailed redis://user:private-password@cache.invalid\u001b[0m"),
    {},
  );
  expect(output).toBe("failed redis://[REDACTED]@cache.invalid");
  expect(verifyGates.find((gate) => gate.id === "build")?.timeoutMs).toBe(600_000);
  expect(verifyGates.find((gate) => gate.id === "tests:workspaces")?.timeoutMs).toBe(600_000);
  expect(verifyGates.find((gate) => gate.id === "consumer")?.timeoutMs).toBe(600_000);
});
