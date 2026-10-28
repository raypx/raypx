import { expect, it, vi } from "vite-plus/test";
import { basename } from "node:path";
import { assertSmokeOwnerRunning, stopSmokeOwner } from "../../native/smoke/owner";

it.each(["darwin", "win32"] as const)(
  "checks the preserved %s daemon and explicitly stops only the smoke profile",
  async (platform) => {
    const run = vi.fn(async (_binary: string, _args: string[]) => ({
      code: 0,
      output: '{"running":true}',
    }));
    const directory = "/isolated smoke profile";
    await assertSmokeOwnerRunning(directory, { platform, run });
    expect(await stopSmokeOwner(directory, { platform, run })).toBe(true);
    expect(run).toHaveBeenCalledTimes(2);
    for (const [index, action] of ["status", "stop"].entries()) {
      const [binary, args] = run.mock.calls[index]!;
      expect(basename(binary)).toBe(platform === "win32" ? "raypx.exe" : "raypx");
      expect(args).toEqual([
        "daemon",
        action,
        "--profile",
        "native-smoke",
        "--data-dir",
        directory,
        "--json",
      ]);
    }
  },
);

it("does not authorize data removal when stopping the Windows owner fails", async () => {
  const run = vi.fn(async () => ({ code: 1, output: "" }));
  expect(await stopSmokeOwner("/isolated", { platform: "win32", run })).toBe(false);
});

it("rejects a disappeared owner instead of treating GUI Quit as preserving it", async () => {
  const run = vi.fn(async () => ({ code: 0, output: '{"running":false}' }));
  await expect(assertSmokeOwnerRunning("/isolated", { platform: "win32", run })).rejects.toThrow(
    "GUI Quit terminated its independent execution owner",
  );
});
