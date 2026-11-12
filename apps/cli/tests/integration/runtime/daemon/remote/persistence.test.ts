import { expect, it } from "vitest";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { agentFixtures } from "../../../../helpers/agents.js";
import { hostFixtures } from "../../../../helpers/remote-control.js";
import { TaskRecords } from "../../../../../src/runtime/agents/infrastructure/store/tasks.js";

const { host } = agentFixtures();
const { control } = hostFixtures();

it.skipIf(process.platform === "win32")(
  "preserves an accepted task when its Relay response loses the connection",
  async () => {
    const f = await host("codex", "codex-interactive"),
      runtime = f.runtime;
    type Result = Awaited<ReturnType<typeof runtime.remote>>;
    let accepted!: (result: Result) => void, release!: () => void;
    const admitted = new Promise<Result>((resolve) => {
      accepted = resolve;
    });
    const delayedResponse = new Promise<void>((resolve) => {
      release = resolve;
    });
    const relay = await control({
      engine: {
        projects: () => runtime.remoteProjects(),
        capabilities: () => runtime.remoteCapabilities(),
        events: async ({ binding }) => runtime.events(binding),
        replay: async ({ binding, after }) => runtime.replay(binding, after),
        snapshot: async ({ binding, id, offset }) => runtime.snapshot(binding, id, offset),
        checkpoint: async ({ binding, sequence }) => runtime.checkpoint(binding, sequence),
        detach: ({ binding }) => runtime.detach(binding),
        observed: async () => {
          throw new Error("No observed commands in this fixture");
        },
        remote: async ({ binding, command }) => {
          const result = await runtime.remote(binding, command);
          accepted(result);
          await delayedResponse;
          return result;
        },
      },
    });
    const routeId = crypto.randomUUID();
    const tasks = new TaskRecords(f.state.db);
    const status = () => tasks.get(f.task.id)?.task;
    try {
      for (const peer of relay.sockets)
        peer.send({
          type: "command",
          routeId,
          command: {
            id: f.task.id,
            deviceId: relay.grant.deviceId,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            request: {
              method: "tasks.create",
              input: {
                id: f.task.id,
                deviceId: relay.grant.deviceId,
                projectId: f.task.projectId,
                provider: "codex",
                mode: "run",
                prompt: "Synthetic persistent task",
              },
            },
          },
        });
      await expect(admitted).resolves.toMatchObject({ ok: true });
      await expect.poll(() => existsSync(join(f.directory, "delivered"))).toBe(true);
      expect(status()).toMatchObject({ status: "running" });
      for (const peer of relay.sockets) peer.close(1012, "Transport lost");
      await expect.poll(() => relay.value.info("account").connected).toBe(false);
      // Replay catches up even though the old command adapter has not returned.
      await expect.poll(() => relay.value.info("account").connected).toBe(true);
      expect(status()).toMatchObject({ status: "running" });
      release();
      await delayedResponse;
      await relay.value.wake();
      expect(
        relay.frames.some((frame) => frame.type === "result" && frame.routeId === routeId),
      ).toBe(false);
      writeFileSync(join(f.directory, "complete"), "");
      await expect.poll(status).toMatchObject({ status: "succeeded" });
      await relay.value.wake();
      expect(
        relay.frames
          .filter((frame) => frame.type === "events")
          .some((frame) =>
            frame.events.some(
              ({ event }) => event.kind === "status" && event.status === "succeeded",
            ),
          ),
      ).toBe(true);
    } finally {
      release();
      await relay.value.detach();
    }
  },
);
