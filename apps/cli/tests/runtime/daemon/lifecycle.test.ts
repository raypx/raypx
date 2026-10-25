import { expect, it } from "vite-plus/test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { profilePath, acquireLock } from "../../../src/runtime/state";
import {
  connectDaemon,
  stopDaemon,
  readDaemon,
  daemonFetch,
} from "../../../src/runtime/daemon/endpoint";
import { startDaemon } from "../../../src/runtime/daemon/server";

it.skipIf(process.platform === "win32")(
  "can stop an incompatible owner and waits for its lock to be released",
  async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "raypx-old-owner-")),
      directory = profilePath({ dataDir });
    mkdirSync(directory, { recursive: true });
    const release = acquireLock(directory, "daemon-owner")!;
    let released = false;
    const endpoint = {
      protocol: 1,
      version: "99.0.0",
      epoch: crypto.randomUUID(),
      token: "a".repeat(64),
      socket: join(dataDir, "host.sock"),
    };
    const server = Bun.serve({
      unix: endpoint.socket,
      fetch(request) {
        if (new URL(request.url).pathname === "/info") return Response.json(endpoint);
        setTimeout(() => {
          released = true;
          release();
        }, 100);
        return Response.json({ stopped: true });
      },
    });
    writeFileSync(join(directory, "daemon.json"), JSON.stringify(endpoint));
    try {
      await expect(connectDaemon({ dataDir }, false)).rejects.toMatchObject({
        code: "HOST_VERSION_MISMATCH",
      });
      expect((await connectDaemon({ dataDir }, false, "any")).version).toBe("99.0.0");
      await expect(stopDaemon({ dataDir })).resolves.toEqual({ stopped: true });
      expect(released).toBe(true);
    } finally {
      if (!released) release();
      await server.stop(true);
      rmSync(dataDir, { recursive: true, force: true });
    }
  },
);

it.skipIf(process.platform === "win32")(
  "rejects new clients immediately after a stop ACK",
  async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "raypx-stopping-owner-"));
    const host = await startDaemon({ dataDir });
    try {
      expect((await daemonFetch(host.endpoint, "/stop", {})).ok).toBe(true);
      const response = await daemonFetch(host.endpoint, `/events?client=${crypto.randomUUID()}`);
      expect(response.status).toBe(503);
      await host.stopped;
      const next = await startDaemon({ dataDir });
      await next.close();
    } finally {
      await host.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  },
);

it.skipIf(process.platform === "win32")(
  "keeps its owner alive and sanitizes an unexpected background rejection",
  async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "raypx-owner-rejection-"));
    const child = Bun.spawn(
      [process.execPath, join(import.meta.dirname, "../../fixtures/daemon/rejection.ts"), dataDir],
      { stdout: "ignore", stderr: "pipe" },
    );
    try {
      await expect
        .poll(() => {
          try {
            return readDaemon(profilePath({ dataDir }));
          } catch {
            return undefined;
          }
        })
        .toBeDefined();
      await Bun.sleep(300);
      expect((await connectDaemon({ dataDir }, false)).epoch).toBeDefined();
      await stopDaemon({ dataDir });
      expect(await child.exited).toBe(0);
      const output = await new Response(child.stderr).text();
      expect(output).toContain("UNHANDLED_REJECTION");
      expect(output).not.toContain("private injected content");
    } finally {
      child.kill();
      await child.exited;
      rmSync(dataDir, { recursive: true, force: true });
    }
  },
);
