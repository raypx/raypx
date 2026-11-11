import { afterEach, beforeEach, expect, it } from "vite-plus/test";
import { mkdtempSync, rmSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon } from "../../../helpers/enrolled.js";
import {
  connectDaemon,
  daemonFetch,
  readDaemon,
  stopDaemon,
} from "../../../../src/runtime/daemon/endpoint.js";
import { profilePath } from "../../../../src/runtime/state/index.js";

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
