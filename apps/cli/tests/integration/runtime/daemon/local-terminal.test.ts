import { expect, it } from "vite-plus/test";
import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRuntime } from "../../../../src/runtime";
import { LocalTerminalControl } from "../../../../src/runtime/daemon/terminal-control";
import { readTerminalEndpoint, terminalFetch } from "../../../../src/runtime/terminal/host";
import type { ObservedProjection, TerminalRequest } from "@raypx/contracts/terminal";
import { LOCAL_WORKSPACE_ID } from "@raypx/contracts/local";

async function fixture() {
  const dataDir = realpathSync(mkdtempSync(join(tmpdir(), "raypx-local-terminal-")));
  const runtime = createRuntime({ dataDir });
  let now = Date.now(),
    online = true,
    supported = true;
  const control = new LocalTerminalControl(
    runtime.state.directory,
    runtime,
    () => {},
    () => now,
  );
  const roots: { id: string; path: string }[] = [];
  for (const name of ["first", "second"]) {
    const path = join(dataDir, name);
    mkdirSync(path);
    const root = (await runtime.request("roots.register", { path })) as {
      id: string;
      path: string;
    };
    await runtime.request("agents.configure", { rootId: root.id, providers: ["claude"] });
    roots.push(root);
  }
  const scope = { apiUrl: "https://example.test", accountId: "account" },
    binding = "binding:1";
  control.configure({ rootIds: roots.map((root) => root.id), away: true, waitSeconds: 60 });
  const endpoint = readTerminalEndpoint(join(runtime.state.directory, "terminal"));
  const list = async () =>
    (await control.request("approvals.local.list", {})) as ObservedProjection;
  const hook = (index = 0) =>
    terminalFetch(endpoint, "hook", "/hook", {
      provider: "claude",
      input: {
        hook_event_name: "PermissionRequest",
        session_id: crypto.randomUUID(),
        cwd: roots[index]!.path,
        tool_name: "Bash",
        tool_input: { command: "printf synthetic" },
      },
    }).then((response) => response.json());
  return {
    control,
    runtime,
    scope,
    binding,
    roots,
    list,
    hook,
    watch: () => control.request("approvals.local.watch", { active: true }, "native"),
    cloud: () =>
      control.attachCloud({
        ...scope,
        binding,
        connected: () => online,
        supported: () => supported,
      }),
    unsupported: () => {
      supported = false;
    },
    offline: () => {
      online = false;
    },
    advance: (ms: number) => {
      now += ms;
    },
    close: async () => {
      await control.close();
      await runtime.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}
it.skipIf(process.platform === "win32")(
  "works without login, uses the profile identity, and does not renew a lease by reading state",
  async () => {
    const f = await fixture();
    try {
      const device = await f.runtime.agents.localDevice(LOCAL_WORKSPACE_ID);
      expect(await f.hook()).toEqual({ fallback: true });
      await f.watch();
      const pending = f.hook();
      await expect.poll(async () => (await f.list()).requests.length).toBe(1);
      expect((await f.list()).requests[0]?.deviceId).toBe(device.id);
      f.advance(15_001);
      await f.list();
      expect(await pending).toEqual({ fallback: true });
    } finally {
      await f.close();
    }
  },
);
it.skipIf(process.platform === "win32")(
  "freezes remote eligibility per request and gives only previously connected channels a bounded grace period",
  async () => {
    const f = await fixture();
    try {
      await f.watch();
      f.cloud();
      f.control.configureCloud(f.scope, { enabled: true, rootIds: [f.roots[0]!.id] });
      const remote = f.hook(),
        local = f.hook(1);
      await expect.poll(async () => (await f.list()).requests.length).toBe(2);
      const projected = f.control.projection(f.binding);
      expect(projected.requests).toHaveLength(1);
      f.offline();
      f.advance(14_000);
      f.control.releaseClient("native");
      expect(await local).toEqual({ fallback: true });
      expect(
        (await f.list()).requests.filter((request) => request.status === "pending"),
      ).toHaveLength(1);
      f.advance(1_001);
      expect(await remote).toEqual({ fallback: true });
      f.control.detachCloud();
      f.cloud();
      expect(await f.hook()).toEqual({ fallback: true });
    } finally {
      await f.close();
    }
  },
);
it.skipIf(process.platform === "win32")(
  "withdraws cloud projections without invalidating a valid local decision or requalifying old requests",
  async () => {
    const f = await fixture();
    try {
      await f.watch();
      const localOnly = f.hook(1);
      await expect.poll(async () => (await f.list()).requests.length).toBe(1);
      f.cloud();
      f.control.configureCloud(f.scope, { enabled: true, rootIds: f.roots.map((root) => root.id) });
      expect(f.control.projection(f.binding).requests).toEqual([]);
      const pending = f.hook();
      await expect.poll(() => f.control.projection(f.binding).requests.length).toBe(1);
      const batch = f.control.projection(f.binding),
        request = batch.requests[0]!;
      f.control.sent(f.binding, batch.requests);
      f.control.acknowledged(f.binding, batch.requests);
      f.control.configureCloud(f.scope, { enabled: false, rootIds: [] });
      expect(f.control.projection(f.binding).requests[0]).toMatchObject({
        status: "cancelled",
        body: "",
        decision: null,
        revision: request.revision + 1,
      });
      expect(await f.control.request("approvals.local.get", { id: request.id })).toMatchObject({
        status: "pending",
        revision: request.revision,
      });
      const decision = {
        id: request.id,
        epoch: request.epoch,
        revision: request.revision,
        receiptId: crypto.randomUUID(),
        decision: { type: "allow" as const },
      };
      f.control.configureCloud(f.scope, { enabled: true, rootIds: f.roots.map((root) => root.id) });
      expect(() => f.control.remoteDecision(f.binding, decision)).toThrow("authorization");
      expect(await f.control.request("approvals.local.decide", { decision })).toMatchObject({
        revision: request.revision + 1,
        status: "decided",
      } satisfies Partial<TerminalRequest>);
      expect(await pending).not.toEqual({ fallback: true });
      f.control.releaseClient("native");
      expect(await localOnly).toEqual({ fallback: true });
      expect(f.control.projection(f.binding).requests[0]?.status).toBe("cancelled");
    } finally {
      await f.close();
    }
  },
);

it.skipIf(process.platform === "win32")(
  "does not treat a managed-only relay as an available terminal channel",
  async () => {
    const f = await fixture();
    try {
      f.cloud();
      f.control.configureCloud(f.scope, { enabled: true, rootIds: f.roots.map((root) => root.id) });
      f.control.connected(f.binding);
      f.unsupported();
      expect(await f.hook()).toEqual({ fallback: true });
      expect(f.control.projection(f.binding).requests).toEqual([]);
    } finally {
      await f.close();
    }
  },
);
