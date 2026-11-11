import { JobError, type CloudJobRun } from "@raypx/core/jobs";
import type { JobDispatchResult } from "@raypx/jobs/server";
import { taskSchema } from "@raypx/core/tasks";
import { ControlError, type ControlService } from "../service.js";
import type { RelayOperation, RelayReply } from "./cluster.js";
import type { DeviceResult, RelayRegistry, SyncPending, Synced } from "./registry.js";
// Only these host paths reject before launching a task. Generic errors can also
// come from saving a receipt after execution, so an explicit failure is not proof.
const knownHostCreateRejections = new Set([
  "CLOSING",
  "DELIVERY_EXPIRED",
  "PROJECT_BUSY",
  "REQUEST_CLOSED",
  "CONTEXT_TOO_LARGE",
]);
async function jobDevice(
  relay: RelayRegistry,
  userId: string,
  run: CloudJobRun,
  signal: AbortSignal,
  expectedConnection?: string,
) {
  if (signal.aborted) throw new JobError("REQUEST_TIMEOUT");
  if (!relay.ready()) throw new JobError("SERVER_UNAVAILABLE");
  if (!relay.inRoom(userId)) throw new JobError("FORBIDDEN");
  try {
    await relay.use((control) => control.commands.validateJobTarget(userId, run.action));
    const device = [...relay.peers.values()]
      .reverse()
      .find(
        (client) =>
          client.ready &&
          client.actor?.role === "device" &&
          client.actor.userId === userId &&
          client.actor.deviceId === run.action.deviceId &&
          client.actor.epoch === run.action.epoch,
      );
    if (!device?.actor) throw new JobError("DEVICE_OFFLINE");
    if (expectedConnection && device.actor.connectionId !== expectedConnection)
      throw new JobError("DEVICE_REPLACED");
    await relay.use((control) => control.commands.validateJobPeer(device.actor!, run.action));
    if (relay.peers.get(device.peer.id) !== device || !device.ready)
      throw new JobError("DEVICE_OFFLINE");
    if (signal.aborted) throw new JobError("REQUEST_TIMEOUT");
    return device;
  } catch (error) {
    if (error instanceof JobError) throw error;
    throw new JobError(error instanceof ControlError ? error.code : "SERVER_UNAVAILABLE");
  }
}
async function forwardJob(
  relay: RelayRegistry,
  type: "dispatch" | "sync",
  userId: string,
  run: CloudJobRun,
  signal: AbortSignal,
) {
  if (signal.aborted) throw new JobError("REQUEST_TIMEOUT");
  if (!relay.inRoom(userId)) throw new JobError("FORBIDDEN");
  if (!relay.cluster) return;
  try {
    await relay.use((control) => control.commands.validateJobTarget(userId, run.action));
  } catch (error) {
    throw new JobError(error instanceof ControlError ? error.code : "SERVER_UNAVAILABLE");
  }
  const connection = await relay.remote(userId, run.action.deviceId);
  const owner = connection.id.split(":")[0]!;
  if (owner === relay.cluster.nodeId) return;
  return relay.cluster.invoke(owner, { type, userId, run, connectionId: connection.id }, signal);
}
export async function dispatchJob(
  relay: RelayRegistry,
  userId: string,
  run: CloudJobRun,
  signal: AbortSignal,
  expectedConnection?: string,
): Promise<Extract<JobDispatchResult, { type: "task" }>> {
  if (run.action.type !== "agent.run" || run.taskId !== run.id)
    throw new JobError("IDEMPOTENCY_CONFLICT");
  if (!expectedConnection) {
    const reply = await forwardJob(relay, "dispatch", userId, run, signal);
    if (reply) {
      if (reply.type !== "task" || reply.taskId !== run.id)
        throw new JobError("INVALID_DEVICE_RESULT", true);
      return reply;
    }
  }
  const device = await jobDevice(relay, userId, run, signal, expectedConnection),
    action = run.action;
  let command: Awaited<ReturnType<ControlService["commands"]["route"]>>;
  try {
    command = await relay.use((control) =>
      control.commands.route(
        userId,
        run.id,
        {
          method: "tasks.create",
          input: {
            id: run.id,
            deviceId: action.deviceId,
            projectId: action.projectId,
            provider: action.provider,
            mode: action.mode,
            prompt: action.prompt,
            ...(action.contextSelection ? { contextSelection: action.contextSelection } : {}),
          },
        },
        action,
      ),
    );
    if (command.recoveredTask)
      return {
        type: "task",
        taskId: command.recoveredTask.id,
        status: command.recoveredTask.status,
      };
    await relay.use((control) => control.commands.validateJobPeer(device.actor!, run.action));
  } catch (error) {
    throw new JobError(error instanceof ControlError ? error.code : "SERVER_UNAVAILABLE");
  }
  if (signal.aborted) throw new JobError("REQUEST_TIMEOUT");
  if (relay.peers.get(device.peer.id) !== device || !device.ready)
    throw new JobError("DEVICE_OFFLINE");
  if (relay.pending.size >= 1024) throw new JobError("TOO_MANY_REQUESTS");
  return new Promise((resolve, reject) => {
    const routeId = crypto.randomUUID();
    let sent = false,
      settled = false;
    const complete = (result: DeviceResult, uncertain = false) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      relay.pending.delete(routeId);
      if (!result.ok) {
        reject(
          new JobError(
            /^[A-Z][A-Z0-9_]{0,79}$/.test(result.code) ? result.code : "DEVICE_UNAVAILABLE",
            uncertain || (sent && !knownHostCreateRejections.has(result.code)),
          ),
        );
        return;
      }
      const parsed = taskSchema.safeParse(result.value);
      if (
        !parsed.success ||
        parsed.data.id !== run.id ||
        parsed.data.deviceId !== action.deviceId
      ) {
        reject(new JobError("INVALID_DEVICE_RESULT", true));
        return;
      }
      resolve({ type: "task", taskId: parsed.data.id, status: parsed.data.status });
    };
    const abort = () => complete({ ok: false, code: "REQUEST_TIMEOUT" }, sent);
    const timer = setTimeout(() => complete({ ok: false, code: "DELIVERY_EXPIRED" }, sent), 15_000);
    relay.pending.set(routeId, {
      kind: "job",
      device: device.peer.id,
      id: run.id,
      method: "tasks.create",
      timer,
      complete,
    });
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) {
      abort();
      return;
    }
    sent = true;
    relay.send(device, { type: "command", routeId, command });
  });
}
export async function syncJob(
  relay: RelayRegistry,
  userId: string,
  run: CloudJobRun,
  signal: AbortSignal,
  expectedConnection?: string,
): Promise<Synced> {
  if (run.action.type !== "device.sync") throw new JobError("INVALID_INPUT");
  if (!expectedConnection) {
    const reply = await forwardJob(relay, "sync", userId, run, signal);
    if (reply) {
      if (reply.type !== "synced") throw new JobError("INVALID_DEVICE_RESULT", true);
      return reply;
    }
  }
  const device = await jobDevice(relay, userId, run, signal, expectedConnection);
  if (!device.cursor) throw new JobError("DEVICE_OFFLINE");
  const key = `${userId}:${run.id}`,
    previous = relay.syncs.get(key);
  if (previous) {
    if (previous.device !== device.peer.id || previous.epoch !== run.action.epoch)
      throw new JobError("IDEMPOTENCY_CONFLICT");
    return previous.promise;
  }
  if (relay.syncs.size >= 1024) throw new JobError("TOO_MANY_REQUESTS");
  if (signal.aborted) throw new JobError("REQUEST_TIMEOUT");
  const { promise, resolve, reject } = Promise.withResolvers<Synced>();
  let sent = false,
    settled = false;
  const complete: SyncPending["complete"] = (value) => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
    relay.syncs.delete(key);
    if (value instanceof JobError) reject(value);
    else resolve(value);
  };
  const abort = () => complete(new JobError("REQUEST_TIMEOUT", sent));
  const timer = setTimeout(() => complete(new JobError("DELIVERY_EXPIRED", sent)), 15_000);
  relay.syncs.set(key, { device: device.peer.id, epoch: run.action.epoch, promise, complete });
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
  else {
    sent = true;
    relay.send(device, { type: "resume", ...device.cursor, snapshot: true, syncId: run.id });
  }
  return promise;
}
/** Run an operation another node forwarded to the node that owns the device socket. */
export async function forwarded(
  relay: RelayRegistry,
  operation: RelayOperation,
  signal: AbortSignal,
): Promise<RelayReply> {
  try {
    const userId = operation.type === "command" ? operation.viewer.userId : operation.userId;
    const deviceId =
      operation.type === "command" ? operation.command.deviceId : operation.run.action.deviceId;
    const device = await relay.localConnection(userId, deviceId, operation.connectionId);
    if (signal.aborted) throw new JobError("REQUEST_TIMEOUT");
    if (operation.type === "dispatch")
      return dispatchJob(relay, userId, operation.run, signal, operation.connectionId);
    if (operation.type === "sync")
      return syncJob(relay, userId, operation.run, signal, operation.connectionId);
    await relay.use((control) => control.credentials.validate(operation.viewer));
    if (Date.parse(operation.command.expiresAt) <= Date.now())
      throw new JobError("DELIVERY_EXPIRED");
    if (relay.pending.size >= 1024) throw new JobError("TOO_MANY_REQUESTS");
    return await new Promise<RelayReply>((resolve, reject) => {
      const routeId = crypto.randomUUID();
      let sent = false,
        settled = false;
      const complete = (result: DeviceResult, uncertain = false) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        signal.removeEventListener("abort", abort);
        relay.pending.delete(routeId);
        if (uncertain) reject(new JobError(result.ok ? "SERVER_UNAVAILABLE" : result.code, sent));
        else resolve({ type: "command", result });
      };
      const abort = () => complete({ ok: false, code: "REQUEST_TIMEOUT" }, true);
      const timer = setTimeout(
        () => complete({ ok: false, code: "DELIVERY_EXPIRED" }, true),
        15_000,
      );
      relay.pending.set(routeId, {
        kind: "job",
        device: device.peer.id,
        id: operation.command.id,
        method: operation.command.request.method,
        timer,
        complete,
      });
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
      else {
        sent = true;
        relay.send(device, { type: "command", routeId, command: operation.command });
      }
    });
  } catch (error) {
    if (error instanceof ControlError) throw new JobError(error.code);
    throw error;
  }
}
