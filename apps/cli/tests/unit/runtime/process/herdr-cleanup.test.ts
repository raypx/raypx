import { describe, expect, it } from "vite-plus/test";
import { removeHerdrDirectory } from "../../../../src/runtime/process/herdr-cleanup";
describe("owned Herdr directory cleanup", () => {
  it("retries Windows handle release errors and eventually removes the directory", async () => {
    let attempts = 0;
    const waits: number[] = [];
    await removeHerdrDirectory(
      "owned-fixture",
      async () => {
        if (++attempts < 3) throw Object.assign(new Error("locked"), { code: "EBUSY" });
      },
      async (milliseconds) => {
        waits.push(milliseconds);
      },
    );
    expect(attempts).toBe(3);
    expect(waits).toEqual([100, 150]);
  });
  it("bounds retries and preserves genuine failures", async () => {
    let attempts = 0;
    await expect(
      removeHerdrDirectory(
        "owned-fixture",
        async () => {
          attempts++;
          throw Object.assign(new Error("still locked"), { code: "EPERM" });
        },
        async () => {},
      ),
    ).rejects.toThrow("still locked");
    expect(attempts).toBe(11);
    await expect(
      removeHerdrDirectory(
        "owned-fixture",
        async () => {
          throw Object.assign(new Error("disk error"), { code: "EIO" });
        },
        async () => {},
      ),
    ).rejects.toThrow("disk error");
  });
});
