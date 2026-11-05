import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { request as httpRequest } from "node:http";
import { runtimeLease } from "../../../../src/runtime/process/lease.ts";
import * as installation from "../../../../src/runtime/process/installation.ts";
import { cliBuild } from "../../../../src/runtime/daemon/build.ts";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon } from "../../../helpers/enrolled.ts";
import {
  connectDaemon,
  daemonFetch,
  daemonLaunch,
  readDaemon,
  stopDaemon,
} from "../../../../src/runtime/daemon/endpoint.ts";
import { profilePath } from "../../../../src/runtime/state/index.ts";

const previous = process.env.RAYPX_LOCAL_TRANSPORT;
beforeEach(() => {
  process.env.RAYPX_LOCAL_TRANSPORT = "tcp";
});
afterEach(() => {
  vi.restoreAllMocks();
  if (previous === undefined) delete process.env.RAYPX_LOCAL_TRANSPORT;
  else process.env.RAYPX_LOCAL_TRANSPORT = previous;
});

it("serves the Windows loopback transport only to direct token holders", async () => {
  const dataDir = mkdtempSync(join(tmpdir(), "raypx-loopback-"));
  const host = await startDaemon({ dataDir });
  try {
    const { port, socket } = host.endpoint;
    expect(socket).toBeUndefined();
    expect(port).toBeGreaterThan(0);
    expect(readDaemon(profilePath({ dataDir }))).toEqual(host.endpoint);
    expect((await connectDaemon({ dataDir }, false)).epoch).toBe(host.endpoint.epoch);
    expect(await (await daemonFetch(host.endpoint, "/info")).json()).toMatchObject({
      owner: "daemon",
      epoch: host.endpoint.epoch,
    });
    const authorization = `Bearer ${host.endpoint.token}`,
      url = `http://127.0.0.1:${port}/info`;
    expect((await fetch(url, {})).status).toBe(403);
    // Browsers attach Origin; DNS rebinding presents another Host. Both fail before the token.
    for (const headers of [
      { authorization, origin: "https://example.com" },
      { authorization, host: `rebound.example:${port}` },
    ])
      expect(
        await new Promise<number>((resolve, reject) => {
          const request = httpRequest(url, { headers }, (response) => {
            response.resume();
            resolve(response.statusCode!);
          });
          request.on("error", reject);
          request.end();
        }),
      ).toBe(403);
    await expect(stopDaemon({ dataDir })).resolves.toEqual({ stopped: true });
    await host.stopped;
  } finally {
    await host.close();
    rmSync(dataDir, { recursive: true, force: true });
  }
});

it("runs a Windows owner from a private per-build copy and prunes older copies", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "raypx-launch-")),
    directory = profilePath({ dataDir }),
    bundle = join(dataDir, "bundle", "raypx.exe"),
    bin = join(dataDir, "bin");
  try {
    mkdirSync(join(dataDir, "bundle"));
    mkdirSync(bin);
    const root = join(dataDir, "bundle");
    const files: Record<string, string> = {};
    for (const name of [
      "raypx",
      "raypx.exe",
      "main.mjs",
      "runtime/node",
      "runtime/node.exe",
      "runtime/pnpm/pnpm",
      "runtime/pnpm/pnpx",
      "runtime/pnpm/pnpm.exe",
      "runtime/pnpm/pnpx.cmd",
    ]) {
      const file = join(root, name);
      mkdirSync(join(file, ".."), { recursive: true });
      writeFileSync(file, "fixture " + name);
      files[name] = createHash("sha256")
        .update("fixture " + name)
        .digest("hex");
    }
    writeFileSync(
      join(root, "runtime.json"),
      JSON.stringify({ ...cliBuild, nodeVersion: "24.22.2", pnpmVersion: "12.16.1", files }),
    );
    vi.spyOn(installation, "cliInstallation").mockReturnValue({
      root,
      bundled: true,
      node: join(root, "runtime/node.exe"),
      entry: join(root, "main.mjs"),
      launcher: bundle,
      pnpm: join(root, "runtime/pnpm/pnpm.exe"),
    });
    expect(daemonLaunch(directory, [bundle], "darwin")).toEqual([bundle]);
    const [copy, entry] = daemonLaunch(directory, [bundle], "win32");
    expect(copy).not.toBe(bundle);
    expect(copy).toContain(join("bin", "daemon"));
    expect(existsSync(entry!)).toBe(true);
    expect(existsSync(join(entry!, "../runtime/pnpm/pnpm.exe"))).toBe(true);
    expect(daemonLaunch(directory, [bundle], "win32")).toEqual([copy, entry]);
    expect(existsSync(bundle)).toBe(true);
    const old = join(entry!, "../../0.0.0-1");
    mkdirSync(old, { recursive: true });
    writeFileSync(join(old, "main.mjs"), "still serving another profile");
    const releaseOld = runtimeLease(old)!;
    const secondOwner = runtimeLease(old)!;
    try {
      daemonLaunch(directory, [bundle], "win32");
      expect(existsSync(join(old, "main.mjs"))).toBe(true);
      releaseOld();
      daemonLaunch(directory, [bundle], "win32");
      expect(existsSync(join(old, "main.mjs"))).toBe(true);
    } finally {
      secondOwner();
    }
    daemonLaunch(directory, [bundle], "win32");
    expect(existsSync(old)).toBe(false);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
