import { expect, it } from "vite-plus/test";
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startDaemon } from "../../../../src/runtime/daemon/server";
import { daemonFetch } from "../../../../src/runtime/daemon/endpoint";
import { createRuntime } from "../../../../src/runtime";
import type { AgentTask } from "@raypx/contracts/tasks";

it.skipIf(process.platform === "win32")(
  "keeps managed work alive when a GUI client disconnects, rejects a second owner and reconnects to the same task",
  async () => {
    const dataDir = mkdtempSync(join(tmpdir(), "raypx-daemon-test-")),
      bin = join(dataDir, "bin"),
      project = join(dataDir, "project");
    mkdirSync(project);
    mkdirSync(bin);
    cpSync(join(import.meta.dirname, "../../../fixtures/agents"), bin, { recursive: true });
    writeFileSync(
      join(bin, "codex"),
      `#!${process.execPath}\n${readFileSync(join(bin, "codex-interactive.mjs"), "utf8")}`,
      { mode: 0o700 },
    );
    const host = await startDaemon({ dataDir, agentExecutables: { codex: join(bin, "codex") } });
    const controllers: AbortController[] = [];
    const connect = async () => {
      const id = crypto.randomUUID(),
        controller = new AbortController();
      controllers.push(controller);
      const stream = await daemonFetch(
        host.endpoint,
        `/events?client=${id}`,
        undefined,
        controller.signal,
      );
      expect(stream.ok).toBe(true);
      const reader = stream.body!.getReader();
      void (async () => {
        try {
          while (!(await reader.read()).done) {
            /* Keep the GUI subscription alive. */
          }
        } catch {
          /* Client disconnect. */
        }
      })();
      return {
        controller,
        request: async (method: string, params: unknown) => {
          const response = await daemonFetch(host.endpoint, `/rpc?client=${id}`, {
            version: 1,
            id: crypto.randomUUID(),
            method,
            params,
          });
          expect(response.status).toBe(200);
          const value = (await response.json()) as { result: unknown; error?: unknown };
          expect(value.error).toBeUndefined();
          return value.result;
        },
      };
    };
    try {
      expect(statSync(host.endpoint.socket).mode & 0o777).toBe(0o600);
      expect((await fetch("http://localhost/info", { unix: host.endpoint.socket })).status).toBe(
        403,
      );
      const first = await connect();
      const root = (await first.request("roots.register", { path: project })) as { id: string };
      await first.request("agents.configure", { rootId: root.id, providers: ["codex"] });
      const device = (await first.request("agents.local.device", { accountId: "account-a" })) as {
        id: string;
      };
      const input = {
        id: crypto.randomUUID(),
        deviceId: device.id,
        projectId: root.id,
        provider: "codex",
        mode: "run",
        prompt: "Synthetic daemon task",
      };
      expect(
        await first.request("agents.local.execute", {
          accountId: "account-a",
          id: input.id,
          request: { method: "tasks.create", input },
        }),
      ).toMatchObject({ ok: true, value: { status: "running" } });
      await expect.poll(() => existsSync(join(project, "delivered"))).toBe(true);
      expect(host.runtime.agents.managesSession("codex", "interactive")).toBe(true);
      expect(host.runtime.agents.managesSession("codex", "nested-session")).toBe(false);
      first.controller.abort();
      const competing = createRuntime({ dataDir });
      try {
        await expect(
          competing.request("agents.local.list", { accountId: "account-a" }),
        ).rejects.toThrow("already owns");
      } finally {
        await competing.close();
      }
      const second = await connect();
      const tasks = (await second.request("agents.local.list", {
        accountId: "account-a",
      })) as AgentTask[];
      expect(tasks[0]?.id).toBe(input.id);
      expect(tasks[0]?.status).toBe("running");
      expect(await second.request("runtime.info", {})).toMatchObject({
        owner: "daemon",
        scheduler: true,
      });
      writeFileSync(join(project, "complete"), "");
      await expect
        .poll(
          async () =>
            (
              (await second.request("agents.local.list", { accountId: "account-a" })) as AgentTask[]
            )[0]?.status,
        )
        .toBe("succeeded");
    } finally {
      for (const controller of controllers) controller.abort();
      await host.close();
      rmSync(dataDir, { recursive: true, force: true });
    }
  },
);
