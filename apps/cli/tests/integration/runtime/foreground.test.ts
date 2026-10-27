import { expect, it } from "vite-plus/test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createForegroundHost } from "../../../src/runtime/foreground";
import type { HostVault } from "../../../src/runtime/daemon/vault";
import type { HostAuthorization } from "@raypx/contracts/terminal";
import type { LocalEvent } from "@raypx/contracts/local";
import { relayClientSchema } from "@raypx/contracts/tasks";

function fixture() {
  const dataDir = mkdtempSync(join(tmpdir(), "raypx-foreground-"));
  const events: LocalEvent[] = [];
  const accountId = "account",
    deviceId = crypto.randomUUID(),
    credential = "k".repeat(64);
  let stored: HostAuthorization | undefined;
  let grants = 0,
    revocations = 0;
  const grant = () => ({
    deviceId,
    epoch: 1,
    token: "t".repeat(64),
    expiresAt: new Date(Date.now() + 600000).toISOString(),
  });
  const api = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request, server) {
      const path = new URL(request.url).pathname;
      if (path === "/relay") {
        if (server.upgrade(request)) return;
        return new Response(null, { status: 426 });
      }
      expect(request.headers.get("cookie")).toBeNull();
      const input = (await request.json()) as { json: { credential: string } };
      expect(input.json.credential).toBe(credential);
      if (path === "/rpc/hosts/revoke") {
        revocations++;
        return Response.json({ json: { revoked: true } });
      }
      expect(path).toBe("/rpc/hosts/grant");
      grants++;
      return Response.json({ json: { accountId, grant: grant() } });
    },
    websocket: {
      message(socket, input) {
        const frame = relayClientSchema.parse(JSON.parse(String(input)));
        if (frame.type === "auth")
          socket.send(
            JSON.stringify({
              type: "ready",
              protocolVersion: frame.protocolVersion,
              role: "device",
            }),
          );
        if (frame.type === "announce")
          socket.send(
            JSON.stringify({
              type: "resume",
              streamId: frame.streamId,
              sequence: 0,
              snapshot: false,
            }),
          );
        if (frame.type === "observed")
          socket.send(
            JSON.stringify({
              type: "observed_ack",
              epoch: frame.epoch,
              revision: frame.revision,
            }),
          );
      },
    },
  });
  const vault: HostVault = {
    get: async () => stored,
    set: async (_binding, value) => {
      stored = value;
      return true;
    },
    remove: async () => {
      stored = undefined;
    },
  };
  const open = () => createForegroundHost({ dataDir, vault, emit: (event) => events.push(event) });
  let host = open();
  const scope = { accountId, apiUrl: api.url.origin };
  return {
    get host() {
      return host;
    },
    scope,
    grant,
    events,
    authorize: async () => {
      await host.request("host.session", scope);
      await host.request("host.authorize", {
        ...scope,
        authorization: {
          accountId,
          deviceId,
          epoch: 1,
          credential,
          expiresAt: new Date(Date.now() + 86400000).toISOString(),
        },
      });
      await expect.poll(() => host.control.info(scope).connected).toBe(true);
    },
    grants: () => grants,
    revocations: () => revocations,
    hasCredential: () => Boolean(stored),
    restart: async () => {
      await host.close();
      host = open();
    },
    close: async () => {
      await host.close();
      await api.stop(true);
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

it("renews and restores the foreground owner without browser cookies, then revokes on logout", async () => {
  const f = fixture();
  try {
    await f.authorize();
    expect(await f.host.request("runtime.info", {})).toMatchObject({
      owner: "foreground",
      hostProtocol: 1,
      scheduler: true,
    });
    expect(await f.host.request("host.info", f.scope)).toMatchObject({
      daemon: false,
      authorized: true,
      persistent: true,
    });
    const binding = readFileSync(join(f.host.runtime.state.directory, "host-binding.json"), "utf8");
    expect(binding).not.toContain("credential");
    expect(binding).not.toContain("token");
    expect(await f.host.request("host.refresh", f.scope)).toBe(true);
    expect(f.grants()).toBe(2);
    await f.restart();
    await expect.poll(() => f.host.control.info(f.scope).connected).toBe(true);
    expect(f.grants()).toBe(3);
    expect(f.hasCredential()).toBe(true);
    await f.host.request("host.session", { ...f.scope, accountId: null });
    expect(f.hasCredential()).toBe(false);
    expect(f.revocations()).toBe(1);
    expect(await f.host.request("host.info", f.scope)).toMatchObject({
      connected: false,
      authorized: false,
    });
  } finally {
    await f.close();
  }
});

it("keeps legacy grant renewal in Desktop when the server has no host authorization endpoint", async () => {
  const f = fixture();
  try {
    await f.host.request("host.session", f.scope);
    await f.host.request("host.legacy", { ...f.scope, grant: f.grant() });
    expect(await f.host.request("host.info", f.scope)).toMatchObject({
      daemon: false,
      legacy: true,
      authorized: false,
      persistent: false,
    });
    expect(await f.host.request("host.refresh", f.scope)).toBe(false);
    expect(f.events.some((event) => event.event === "sync.grantRequired")).toBe(true);
    expect(f.grants()).toBe(0);
  } finally {
    await f.close();
  }
});

it("cancels foreground work on close and releases the owner for the next launch", async () => {
  const f = fixture();
  try {
    const marker = join(f.host.runtime.state.directory, "command-started");
    const command = f.host.request("tools.run", {
      id: crypto.randomUUID(),
      executable: process.execPath,
      args: [
        "-e",
        "await Bun.write(process.argv.at(-1), 'started'); setInterval(() => {}, 1000)",
        marker,
      ],
      cwd: f.host.runtime.state.directory,
      timeoutMs: 30000,
    });
    await expect.poll(() => existsSync(marker)).toBe(true);
    await f.host.close();
    expect(await command).toMatchObject({ cancelled: true });
    await expect(f.host.request("roots.list", {})).rejects.toMatchObject({ code: "CLOSING" });
    await f.restart();
    expect(await f.host.request("roots.list", {})).toEqual([]);
  } finally {
    await f.close();
  }
});
