import { expect, it, vi } from "vite-plus/test";
import { join, resolve } from "node:path";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import {
  assertSmokeOwnerRunning,
  restartSmokeOwner,
  stopSmokeOwner,
  smokeOwnerIdentity,
} from "../../tests/native/smoke/owner.ts";

it.each(["darwin", "win32"] as const)(
  "checks the preserved %s daemon and explicitly stops only the smoke profile",
  async (platform) => {
    const run = vi.fn(async (_binary: string, _args: string[], _env?: NodeJS.ProcessEnv) => ({
      code: 0,
      output: '{"running":true}',
    }));
    const directory = "/isolated smoke profile";
    await assertSmokeOwnerRunning(directory, { platform, run });
    expect(await stopSmokeOwner(directory, { platform, run })).toBe(true);
    expect(await restartSmokeOwner(directory, { platform, run })).toBe(true);
    expect(run).toHaveBeenCalledTimes(3);
    for (const [index, action] of ["status", "stop", "restart"].entries()) {
      const [binary, args, env] = run.mock.calls[index]!;
      expect(binary).toBe(
        resolve(
          import.meta.dirname,
          "../../resources/bin",
          platform === "win32" ? "raypx.exe" : "raypx",
        ),
      );
      expect(args).toEqual([
        "daemon",
        action,
        "--profile",
        "native-smoke",
        "--data-dir",
        directory,
        "--json",
      ]);
      expect(env?.RAYPX_HOME).toBe(join(directory, "config"));
      expect(env?.CLAUDE_CONFIG_DIR).toBe(join(directory, "claude"));
      expect(env?.CODEX_HOME).toBe(join(directory, "codex"));
    }
  },
);

it("does not authorize data removal when stopping the Windows owner fails", async () => {
  const run = vi.fn(async () => ({ code: 1, output: "" }));
  expect(await stopSmokeOwner("/isolated", { platform: "win32", run })).toBe(false);
  expect(await restartSmokeOwner("/isolated", { platform: "win32", run })).toBe(false);
});

it("authenticates daemon identity and rejects an endpoint from another epoch", async () => {
  const directory = await mkdtemp(join(tmpdir(), "raypx-smoke-identity-"));
  const identity = { pid: 123, epoch: "synthetic-epoch", builtAt: 42, version: "0.1.0" };
  let epoch = identity.epoch;
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      expect(request.headers.get("authorization")).toBe("Bearer synthetic-token");
      return Response.json({ ...identity, epoch });
    },
  });
  try {
    await mkdir(join(directory, "profiles/native-smoke"), { recursive: true });
    await writeFile(
      join(directory, "profiles/native-smoke/daemon.json"),
      JSON.stringify({ ...identity, port: server.port, token: "synthetic-token" }),
    );
    expect(await smokeOwnerIdentity(directory)).toEqual(identity);
    epoch = "another-epoch";
    await expect(smokeOwnerIdentity(directory)).rejects.toThrow(
      /Expected values to be strictly equal/,
    );
  } finally {
    await server.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
});

it("rejects a disappeared owner instead of treating GUI Quit as preserving it", async () => {
  const run = vi.fn(async () => ({ code: 0, output: '{"running":false}' }));
  await expect(assertSmokeOwnerRunning("/isolated", { platform: "win32", run })).rejects.toThrow(
    "GUI Quit terminated its independent execution owner",
  );
});
