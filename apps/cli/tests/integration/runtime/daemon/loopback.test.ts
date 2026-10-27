import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon } from "../../../../src/runtime/daemon/server";
import {
  connectDaemon,
  daemonFetch,
  daemonLaunch,
  readDaemon,
  stopDaemon,
} from "../../../../src/runtime/daemon/endpoint";
import { profilePath } from "../../../../src/runtime/state";

const previous = process.env.RAYPX_LOCAL_TRANSPORT;
beforeEach(() => {
  process.env.RAYPX_LOCAL_TRANSPORT = "tcp";
});
afterEach(() => {
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
    expect((await fetch(url, { proxy: false })).status).toBe(403);
    // Browsers attach Origin; DNS rebinding presents another Host. Both fail before the token.
    for (const headers of [
      { authorization, origin: "https://example.com" },
      { authorization, host: `rebound.example:${port}` },
    ])
      expect((await fetch(url, { proxy: false, headers })).status).toBe(403);
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
    writeFileSync(bundle, "compiled");
    writeFileSync(join(bin, "raypx-0.0.1-1.exe"), "old");
    writeFileSync(join(bin, "unrelated.exe"), "keep");
    expect(daemonLaunch(directory, [bundle], "darwin")).toEqual([bundle]);
    expect(daemonLaunch(directory, ["bun", "main.ts"], "win32")).toEqual(["bun", "main.ts"]);
    const [copy] = daemonLaunch(directory, [bundle], "win32");
    expect(copy).not.toBe(bundle);
    expect(copy!.startsWith(bin)).toBe(true);
    expect(readdirSync(bin).sort()).toEqual([copy!.slice(bin.length + 1), "unrelated.exe"].sort());
    expect(daemonLaunch(directory, [bundle], "win32")).toEqual([copy]);
    expect(existsSync(bundle)).toBe(true);
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
