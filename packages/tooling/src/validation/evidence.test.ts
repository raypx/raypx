import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { workspaceFixtures } from "../../tests/helpers/workspace.ts";
import { Evidence } from "./evidence";

const { fixture } = workspaceFixtures();
afterEach(() => vi.restoreAllMocks());

function commands(evidence: Evidence) {
  return readFileSync(join(evidence.directory, "commands.json"), "utf8");
}

it("records elapsed time and returns the measured operation's value", async () => {
  const evidence = new Evidence(fixture(), "timings");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const now = vi.spyOn(performance, "now").mockReturnValue(100);
  const result = { token: "private-operation-value" };
  await evidence.run(async () => {
    await expect(
      evidence.measure("service-ready", async () => {
        now.mockReturnValue(142.5);
        return result;
      }),
    ).resolves.toBe(result);
  });
  expect(JSON.parse(commands(evidence))).toEqual([
    { label: "service-ready", code: 0, durationMs: 42.5 },
  ]);
  expect(log).toHaveBeenCalledWith("service-ready: passed (43 ms)");
  expect(commands(evidence)).not.toContain(result.token);
});

it("records failed elapsed time and rethrows the original error without serializing private data", async () => {
  const evidence = new Evidence(fixture(), "timings");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const now = vi.spyOn(performance, "now").mockReturnValue(20);
  const failure = new Error("private-operation-secret");
  await expect(
    evidence.run(async () => {
      await evidence.measure("service-ready", async () => {
        now.mockReturnValue(35);
        throw failure;
      });
    }),
  ).rejects.toBe(failure);
  expect(JSON.parse(commands(evidence))).toEqual([
    { label: "service-ready", code: 1, durationMs: 15 },
  ]);
  expect(log).toHaveBeenCalledWith("service-ready: failed (15 ms)");
  expect(commands(evidence)).not.toContain(failure.message);
  expect(JSON.stringify(log.mock.calls)).not.toContain(failure.message);
});

it.each(["", "../cleanup", "cleanup/file", "cleanup secret", "cleanup\n", "a".repeat(129)])(
  "rejects invalid measurement label %j before running or recording the operation",
  async (label) => {
    const evidence = new Evidence(fixture(), "timings");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const operation = vi.fn(async () => {});
    await evidence.run(async () => {
      await expect(evidence.measure(label, operation)).rejects.toThrow("Invalid validation label");
    });
    expect(operation).not.toHaveBeenCalled();
    expect(JSON.parse(commands(evidence))).toEqual([]);
  },
);

it("measures cleanup after interruption while retaining the interrupted run result", async () => {
  const evidence = new Evidence(fixture(), "timings");
  vi.spyOn(console, "log").mockImplementation(() => {});
  const listeners = new Set(process.listeners("SIGINT"));
  const cleanup = vi.fn(async () => {});
  await expect(
    evidence.run(async () => {
      const interrupt = process.listeners("SIGINT").find((listener) => !listeners.has(listener));
      expect(interrupt).toBeDefined();
      interrupt!("SIGINT");
      expect(() => evidence.check()).toThrow("Validation interrupted");
      await evidence.measure("cleanup", cleanup);
    }),
  ).rejects.toThrow("Validation interrupted");
  expect(cleanup).toHaveBeenCalledOnce();
  expect(JSON.parse(commands(evidence))).toEqual([
    { label: "cleanup", code: 0, durationMs: expect.any(Number) },
  ]);
});

it("prints command duration without recording the command twice or disclosing argv/environment", async () => {
  const evidence = new Evidence(fixture(), "timings");
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const secret = "private-command-value";
  await evidence.run(async () => {
    await evidence.command("command", [process.execPath, "-e", `// ${secret}\nprocess.exit(0)`], {
      ...process.env,
      PRIVATE_TOKEN: secret,
    });
  });
  expect(JSON.parse(commands(evidence))).toEqual([
    { label: "command", code: 0, durationMs: expect.any(Number) },
  ]);
  expect(log).toHaveBeenCalledWith(expect.stringMatching(/^command: passed \(\d+ ms\)$/));
  expect(commands(evidence)).not.toContain(secret);
  expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
});
