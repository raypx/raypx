import { beforeEach, expect, test, vi } from "vite-plus/test";
import type { ConsumerFixture } from "../lib/consumer/fixture.ts";
import { checkRuntime } from "../lib/consumer/runtime.ts";

const mocks = vi.hoisted(() => ({
  run: vi.fn<typeof import("../lib/process.ts").run>(),
  write: vi.fn<typeof import("../lib/consumer/manifest.ts").write>(),
  success: vi.fn<(message: string) => void>(),
  log: vi.fn<(message: string) => void>(),
}));

vi.mock("../lib/process.ts", () => ({ run: mocks.run }));
vi.mock("../lib/logger.ts", () => ({
  scriptLogger: { success: mocks.success, log: mocks.log },
}));
vi.mock("../lib/consumer/manifest.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/consumer/manifest.ts")>()),
  write: mocks.write,
}));

const fixture: ConsumerFixture = {
  directory: "/fixture/consumer",
  packages: new Map(),
  cleanup: async () => undefined,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.run.mockResolvedValue("captured child stdout\ncaptured child stderr\n");
  mocks.write.mockResolvedValue(undefined);
});

test("consumer runtimes report concise success without replaying captured child output", async () => {
  await checkRuntime(fixture, true);
  expect(mocks.run.mock.calls).toEqual([
    ["node", ["smoke.mjs"], fixture.directory],
    ["bun", ["--no-env-file", "smoke.mjs"], fixture.directory],
  ]);
  expect(mocks.success.mock.calls).toEqual([
    ["Consumer node: public runtime checks passed."],
    ["Consumer bun: public runtime checks passed."],
  ]);
  expect(mocks.log).not.toHaveBeenCalled();
});

test("failed runtime validation produces no success summary and stops before the next runtime", async () => {
  mocks.run.mockRejectedValue(new Error("runtime validation failed"));
  await expect(checkRuntime(fixture, true)).rejects.toThrow("runtime validation failed");
  expect(mocks.run).toHaveBeenCalledOnce();
  expect(mocks.success).not.toHaveBeenCalled();
  expect(mocks.log).not.toHaveBeenCalled();
});
