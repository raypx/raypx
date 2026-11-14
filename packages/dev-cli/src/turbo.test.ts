import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { turbo } from "./turbo.js";

const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("@raypx/runtime-node/process", () => ({ spawnProcess: mocks.spawn }));
const directories: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function fixture(output: (directory: string) => string[], code = 0) {
  const root = mkdtempSync(join(tmpdir(), "raypx-turbo-summary-"));
  directories.push(root);
  const directory = join(root, ".turbo/runs");
  mkdirSync(directory, { recursive: true });
  vi.spyOn(process.stdout, "write").mockReturnValue(true);
  mocks.spawn.mockImplementation(() => ({
    stdout: new ReadableStream({
      start(controller) {
        for (const chunk of output(directory)) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    }),
    exited: Promise.resolve(code),
    kill: vi.fn(),
  }));
  return root;
}

it("reads its own emitted summary when a concurrent invocation also writes one", async () => {
  const root = fixture((directory) => {
    const other = { tasks: [{ taskId: "other#test", command: "test", cache: { status: "HIT" } }] };
    const own = {
      tasks: [
        {
          taskId: "own#check",
          command: "check",
          cache: { status: "MISS" },
          execution: { startTime: 10, endTime: 35 },
        },
      ],
    };
    writeFileSync(join(directory, "a-concurrent.json"), JSON.stringify(other));
    writeFileSync(join(directory, "z-own.json"), JSON.stringify(own));
    return [
      "other#test: Summary: ignored\n\u001b[32mSum",
      `mary: ${join(directory, "z-own.json")}\u001b[0m\n`,
    ];
  });
  expect(await turbo(root, ["own#check"])).toEqual([
    { taskId: "own#check", cached: false, durationMs: 25 },
  ]);
});

it("does not use an unrelated summary when its process emits none", async () => {
  const root = fixture((directory) => {
    writeFileSync(join(directory, "foreign.json"), JSON.stringify({ tasks: [] }));
    return ["own#check: complete\n"];
  });
  await expect(turbo(root, ["own#check"])).rejects.toThrow("summary is unavailable");
});

it("reads the summary from structured Turbo output without requiring a final newline", async () => {
  const root = fixture((directory) => {
    const report = join(directory, "structured.json");
    writeFileSync(report, JSON.stringify({ tasks: [] }));
    return [JSON.stringify({ source: "turbo", text: `Summary: ${report}` })];
  });
  expect(await turbo(root, ["own#check"], { options: ["--json"] })).toEqual([]);
});

it("rejects a failed Turbo process even if a summary was emitted", async () => {
  const root = fixture((directory) => [`Summary: ${join(directory, "failed.json")}\n`], 1);
  await expect(turbo(root, ["own#check"])).rejects.toThrow("exited 1");
});
