import { afterEach, expect, it, vi } from "vite-plus/test";
import { clean } from "../../src/clean.js";

const mocks = vi.hoisted(() => ({ rm: vi.fn() }));
vi.mock("node:fs/promises", () => ({ rm: mocks.rm }));
vi.mock("../../src/repository.js", () => ({
  discover: () => ({ workspaces: [{ path: "packages/feature" }] }),
}));
afterEach(() => vi.resetAllMocks());

it("bounds parallel removals and waits for every batch", async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  mocks.rm.mockReturnValue(blocked);

  const pending = clean("/fixture");
  expect(mocks.rm).toHaveBeenCalledTimes(8);
  let complete = false;
  const completed = pending.then(() => {
    complete = true;
  });
  await Promise.resolve();
  expect(complete).toBe(false);

  release();
  await completed;
  expect(mocks.rm.mock.calls.length).toBeGreaterThan(8);
  expect(complete).toBe(true);
});

it("reports a failed removal to the caller", async () => {
  mocks.rm.mockResolvedValue(undefined).mockRejectedValueOnce(new Error("Permission denied"));
  await expect(clean("/fixture")).rejects.toThrow("Permission denied");
});
