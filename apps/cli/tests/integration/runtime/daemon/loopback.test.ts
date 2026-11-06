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
    for (const name of ["raypx", "raypx.exe", "main.mjs", "runtime/node", "runtime/node.exe"]) {
      const file = join(root, name);
      mkdirSync(join(file, ".."), { recursive: true });
      writeFileSync(file, "fixture " + name);
      files[name] = createHash("sha256")
        .update("fixture " + name)
        .digest("hex");
    }
    writeFileSync(
      join(root, "runtime.json"),
      JSON.stringify({ ...cliBuild, nodeVersion: "24.22.2", files }),
    );
    vi.spyOn(installation, "cliInstallation").mockReturnValue({
      root,
      bundled: true,
      systemNode: false,
      node: join(root, "runtime/node.exe"),
      entry: join(root, "main.mjs"),
      launcher: bundle,
    });
    expect(daemonLaunch(directory, [bundle], "darwin")).toEqual([bundle]);
    const [copy, entry] = daemonLaunch(directory, [bundle], "win32");
    expect(copy).not.toBe(bundle);
    expect(copy).toContain(join("bin", "daemon"));
    expect(existsSync(entry!)).toBe(true);
    expect(existsSync(join(entry!, "../runtime/node.exe"))).toBe(true);
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

it("keeps the external Node interpreter when copying a Windows JS package owner", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "raypx-package-owner-"));
  try {
    const root = join(dataDir, "package");
    mkdirSync(root);
    writeFileSync(join(root, "main.mjs"), "fixture entry");
    writeFileSync(
      join(root, "runtime.json"),
      JSON.stringify({
        ...cliBuild,
        nodeVersion: process.versions.node,
        runtime: "system",
        files: { "main.mjs": createHash("sha256").update("fixture entry").digest("hex") },
      }),
    );
    vi.spyOn(installation, "cliInstallation").mockReturnValue({
      root,
      bundled: true,
      systemNode: true,
      node: process.execPath,
      entry: join(root, "main.mjs"),
      launcher: join(root, "main.mjs"),
    });
    const launch = daemonLaunch(
      profilePath({ dataDir }),
      [process.execPath, join(root, "main.mjs")],
      "win32",
    );
    expect(launch[0]).toBe(process.execPath);
    expect(launch[1]).toContain(join("bin", "daemon"));
    expect(existsSync(launch[1]!)).toBe(true);
    expect(existsSync(join(launch[1]!, "../runtime"))).toBe(false);
    expect(existsSync(join(root, "main.mjs"))).toBe(true);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
