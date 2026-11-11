import { rejects } from "node:assert/strict";
import { afterEach, expect, it, mock } from "bun:test";

const rm = mock<typeof import("node:fs/promises").rm>();
await mock.module("node:fs/promises", () => ({ rm }));
await mock.module("./repository.js", () => ({
  discover: () => ({ workspaces: [{ path: "packages/feature" }] }),
}));
const { clean } = await import("./clean.ts");
afterEach(() => rm.mockReset());

it("bounds parallel removals and waits for every batch", async () => {
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  rm.mockReturnValue(blocked);

  const pending = clean("/fixture");
  await Promise.resolve();
  expect(rm).toHaveBeenCalledTimes(8);
  let complete = false;
  const completed = pending.then(() => {
    complete = true;
  });
  await Promise.resolve();
  expect(complete).toBe(false);

  release();
  await completed;
  expect(rm.mock.calls.length).toBeGreaterThan(8);
  expect(complete).toBe(true);
});

it("reports a failed removal to the caller", async () => {
  rm.mockResolvedValue(undefined).mockRejectedValueOnce(new Error("Permission denied"));
  await rejects(clean("/fixture"), /Permission denied/);
});
