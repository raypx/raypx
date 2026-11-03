import { JobError, type CloudJobRun } from "@raypx/jobs";
import { ControlError, type ControlService } from "../service.js";
import type { RelayCluster, RelayReply } from "./cluster.js";
import type { RelayJobTransport } from "./jobs.js";

/** API-side broker client. Socket peers and execution remain in the Relay service. */
export async function createRemoteRelay(control: ControlService, cluster?: RelayCluster) {
  let closed = false;
  const ready = () => !closed && Boolean(cluster?.ready());
  if (cluster) {
    // This node issues private operations; it never accepts forwarded execution.
    await cluster
      .start(
        async () => {
          throw new JobError("FORBIDDEN");
        },
        async () => {},
        () => {},
      )
      .catch(() => {});
  }
  const invoke = async (
    type: "dispatch" | "sync",
    userId: string,
    run: CloudJobRun,
    signal: AbortSignal,
  ): Promise<RelayReply> => {
    if (signal.aborted) throw new JobError("REQUEST_TIMEOUT");
    if (!ready() || !cluster) throw new JobError("SERVER_UNAVAILABLE");
    try {
      await control.commands.validateJobTarget(userId, run.action);
      const connection = await control.tasks.connection(userId, run.action.deviceId);
      if (!connection?.ready) throw new JobError("DEVICE_OFFLINE");
      const nodeId = connection.id.split(":")[0]!;
      if (!/^[0-9a-f-]{36}$/i.test(nodeId) || !connection.id.startsWith(nodeId + ":"))
        throw new JobError("DEVICE_OFFLINE");
      return await cluster.invoke(
        nodeId,
        { type, userId, run, connectionId: connection.id },
        signal,
      );
    } catch (error) {
      if (error instanceof JobError) throw error;
      throw new JobError(error instanceof ControlError ? error.code : "SERVER_UNAVAILABLE");
    }
  };
  const transport: RelayJobTransport = {
    async dispatch(userId, run, signal) {
      const reply = await invoke("dispatch", userId, run, signal);
      if (reply.type !== "task" || reply.taskId !== run.id)
        throw new JobError("INVALID_DEVICE_RESULT", true);
      return reply;
    },
    async sync(userId, run, signal) {
      const reply = await invoke("sync", userId, run, signal);
      if (reply.type !== "synced") throw new JobError("INVALID_DEVICE_RESULT", true);
      return reply;
    },
  };
  return {
    ...transport,
    ready,
    async revoke(userId: string, deviceId: string) {
      // Database revocation is already authoritative, even when the broker is unavailable.
      if (cluster && !closed) await cluster.notify({ type: "revoke", userId, deviceId });
    },
    async shutdown() {
      if (closed) return;
      closed = true;
      await cluster?.close();
    },
  };
}
