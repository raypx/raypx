import type { TaskProjectionPorts } from "@raypx/tasks/server";
import type { ControlRepository } from "./ports.js";
import type { ControlCredentials } from "./application/credentials.js";
import { ControlError, type RelayActor } from "./records.js";
import { releaseContextCommand } from "./context-receipts.js";

/** Keep authorization and dispatch receipts in the projection writer's transaction. */
export function taskProjectionPorts(
  repository: ControlRepository,
  credentials: ControlCredentials,
): TaskProjectionPorts<RelayActor> {
  return {
    read: (userId, run) => repository.read(userId, run),
    withDevice: (actor, run, fence) =>
      credentials.withDevice(
        actor,
        (tx, device) =>
          run(
            {
              get: (kind, id) => tx.get(kind, id),
              list: (kind, deviceId, query) => tx.list(kind, deviceId, query),
              put: tx.put.bind(tx),
              remove: (kind, id) => tx.remove(kind, id),
              pruneEvents: (deviceId, streamId, orphans) =>
                tx.pruneEvents(deviceId, streamId, orphans),
              releaseContext: (task) => releaseContextCommand(tx, task),
            },
            device,
          ),
        fence,
      ),
    disconnect: (actor) =>
      repository.deviceTransaction(actor.userId, actor.deviceId, async (tx) => {
        if (actor.role !== "device") return;
        const device = await tx.get("device", actor.deviceId);
        if (device?.connectionId !== actor.connectionId) return;
        device.lastSeenAt = null;
        device.connectionId = null;
        await tx.put("device", device);
      }),
    error: (code) => new ControlError(code),
  };
}
