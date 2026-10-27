import { expect, it } from "vite-plus/test";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon } from "../../../../src/runtime/daemon/server";
import { bindingKey, type HostVault } from "../../../../src/runtime/daemon/vault";
import { profilePath } from "../../../../src/runtime/state";
import { readTerminalEndpoint, terminalFetch } from "../../../../src/runtime/terminal/host";
import { TerminalStore } from "../../../../src/runtime/terminal/store";
import { terminalCapabilities } from "../../../../src/runtime/terminal/protocol";
import type {
  HostAuthorization,
  ObservedProjection,
  TerminalSession,
} from "@raypx/contracts/terminal";
import { relayClientSchema } from "@raypx/contracts/tasks";

async function fixture(seed = false) {
  const dataDir = mkdtempSync(join(tmpdir(), "raypx-daemon-control-"));
  const accountId = "account",
    deviceId = crypto.randomUUID();
  let denied = false,
    stored: HostAuthorization | undefined;
  const api = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request, server) {
      if (new URL(request.url).pathname === "/relay") {
        if (server.upgrade(request)) return;
        return new Response(null, { status: 426 });
      }
      if (new URL(request.url).pathname === "/rpc/hosts/revoke")
        return Response.json({ json: { revoked: true } });
      if (denied)
        return Response.json(
          {
            json: {
              defined: false,
              code: "UNAUTHORIZED",
              message: "expired",
              data: { error: { code: "AUTH_REQUIRED" } },
            },
          },
          { status: 401 },
        );
      return Response.json({
        json: {
          accountId,
          grant: {
            deviceId,
            epoch: 1,
            token: "a".repeat(64),
            expiresAt: new Date(Date.now() + 600000).toISOString(),
          },
        },
      });
    },
    websocket: {
      message(socket, data) {
        const frame = relayClientSchema.parse(JSON.parse(String(data)));
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
            JSON.stringify({ type: "observed_ack", epoch: frame.epoch, revision: frame.revision }),
          );
      },
    },
  });
  const scope = { accountId, apiUrl: api.url.origin },
    terminalDirectory = join(
      profilePath({ dataDir }),
      "hosts",
      bindingKey(scope.apiUrl, accountId),
    );
  if (seed) {
    const store = new TerminalStore(terminalDirectory);
    const sessions: TerminalSession[] = [];
    for (let index = 0; index < 111; index++) {
      const session: TerminalSession = {
        id: crypto.randomUUID(),
        provider: "claude",
        providerSessionId: `session-${index}`,
        projectId: crypto.randomUUID(),
        capabilities: terminalCapabilities("claude"),
      };
      sessions.push(session);
      store.session(String(index), session);
      store.save({
        version: 1,
        id: crypto.randomUUID(),
        sessionId: (index === 110 ? sessions[0] : session)!.id,
        epoch: crypto.randomUUID(),
        revision: 1,
        provider: "claude",
        invocationId: crypto.randomUUID(),
        kind: "permission",
        title: `Bash ${index}`,
        encoding: "plain",
        body: "{}",
        questions: [],
        createdAt: new Date().toISOString(),
        expiresAt: new Date().toISOString(),
        status: "cancelled",
        decision: null,
      });
    }
    store.close();
  }
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
  const host = await startDaemon({
    dataDir,
    vault,
    agentExecutables: { claude: "/missing-raypx-test-claude", codex: "/missing-raypx-test-codex" },
  });
  const request = host.control.request.bind(host.control);
  await request("host.session", scope);
  await request("host.enable", { ...scope, enabled: true });
  await request("host.authorize", {
    ...scope,
    authorization: {
      accountId,
      deviceId,
      epoch: 1,
      credential: "k".repeat(64),
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
    },
  });
  await expect.poll(() => host.control.info(scope).connected).toBe(true);
  return {
    host,
    scope,
    terminalDirectory,
    request,
    dataDir,
    deny: () => {
      denied = true;
    },
    hasKey: () => Boolean(stored),
    close: async () => {
      await host.close();
      await api.stop(true);
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
it.skipIf(process.platform === "win32")(
  "updates Away policy in place and only withdraws affected requests, then exposes expired authorization",
  async () => {
    const f = await fixture();
    try {
      const roots = [];
      for (const name of ["a", "b", "c"]) {
        const path = join(f.dataDir, name);
        mkdirSync(path);
        const root = (await f.host.runtime.request("roots.register", { path })) as {
          id: string;
          path: string;
        };
        await f.host.runtime.request("agents.configure", {
          rootId: root.id,
          providers: ["claude"],
        });
        roots.push(root);
      }
      const configure = (rootIds: string[], waitSeconds: number) =>
        f.request("observed.configure", { ...f.scope, rootIds, waitSeconds, away: true });
      await configure(
        roots.slice(0, 2).map((root) => root.id),
        300,
      );
      const endpoint = readTerminalEndpoint(f.terminalDirectory);
      const hook = (root: { path: string }, session: string) =>
        terminalFetch(endpoint, "hook", "/hook", {
          provider: "claude",
          input: {
            hook_event_name: "PermissionRequest",
            session_id: session,
            cwd: root.path,
            tool_name: "Bash",
            tool_input: { command: "printf synthetic" },
          },
        }).then(
          (response) => response.json(),
          () => ({ fallback: true }),
        );
      const first = hook(roots[0]!, "first"),
        second = hook(roots[1]!, "second");
      const list = () => f.request("observed.list", f.scope) as Promise<ObservedProjection>;
      await expect
        .poll(
          async () => (await list()).requests.filter((value) => value.status === "pending").length,
        )
        .toBe(2);
      await configure(
        roots.map((root) => root.id),
        60,
      );
      expect(readTerminalEndpoint(f.terminalDirectory).epoch).toBe(endpoint.epoch);
      expect((await list()).requests.filter((value) => value.status === "pending")).toHaveLength(2);
      await configure([roots[1]!.id, roots[2]!.id], 60);
      expect(await first).toEqual({ fallback: true });
      expect((await list()).requests.filter((value) => value.status === "pending")).toHaveLength(1);
      f.deny();
      await f.request("host.refresh", f.scope);
      expect(f.host.control.info(f.scope)).toMatchObject({
        authorized: false,
        error: "AUTH_REQUIRED",
      });
      expect(f.hasKey()).toBe(false);
      expect(await second).toEqual({ fallback: true });
    } finally {
      await f.close();
    }
  },
);
it.skipIf(process.platform === "win32")(
  "includes every referenced session even when an old session receives recent work",
  async () => {
    const f = await fixture(true);
    try {
      const projection = (await f.request("observed.list", f.scope)) as ObservedProjection;
      const ids = new Set(projection.sessions.map((session) => session.id));
      expect(projection.requests).toHaveLength(100);
      expect(projection.requests.every((request) => ids.has(request.sessionId))).toBe(true);
      expect(projection.sessions.length).toBeLessThanOrEqual(100);
      expect(projection.requests[0]?.title).toBe("Bash 110");
      expect(projection.requests.at(-1)?.title).toBe("Bash 11");
    } finally {
      await f.close();
    }
  },
);
