import type { AgentCapability, AgentTask } from "@raypx/core/tasks";
import type { DeviceProject } from "@raypx/contracts/tasks";
import type { TaskProjectionRecords } from "./records.ts";

/** The mutable projection fields inside an authorized device transaction. */
export interface ProjectionDevice {
  id: string;
  revoked: boolean;
  epoch: number;
  lastSeenAt: string | null;
  streamId: string | null;
  instanceId: string | null;
  connectionId: string | null;
  cursor: number;
  initialized: boolean;
  capabilities: AgentCapability[];
}

/** Already authenticated by the caller; writes still require its withDevice fence. */
export interface ProjectionActor {
  role: "viewer" | "device";
  userId: string;
  deviceId: string;
  epoch: number;
  connectionId: string;
}

type Records = TaskProjectionRecords & {
  device: ProjectionDevice;
  project: DeviceProject & { deviceId: string; projectId: string };
};
type Kind = keyof Records;
type Query = {
  device: { limit?: number; ids?: string[] };
  project: { limit?: number; ids?: string[] };
  task: { limit?: number; beforeTask?: string; projectId?: string };
  request: { limit?: number; taskId?: string; pendingApprovals?: boolean };
  event: {
    limit?: number;
    taskId?: string;
    streamId?: string;
    after?: number;
    beforeActivity?: number;
    activity?: boolean;
    descending?: boolean;
  };
};
export interface ProjectionReader {
  get<K extends Kind>(kind: K, id: string): Promise<Records[K] | undefined>;
  list<K extends Kind>(
    kind: K,
    deviceId?: string,
    query?: Query[NoInfer<K>],
  ): Promise<Records[K][]>;
}
export interface ProjectionTransaction extends ProjectionReader {
  put<K extends Exclude<Kind, "device">>(kind: K, value: Records[NoInfer<K>]): Promise<Records[K]>;
  remove(kind: Exclude<Kind, "device">, id: string): Promise<void>;
  pruneEvents(deviceId: string, streamId: string, orphans?: boolean): Promise<void>;
  /** Release a frozen dispatch receipt in the same transaction as its projection. */
  releaseContext(task: AgentTask): Promise<void>;
}
export interface TaskProjectionPorts<Actor extends ProjectionActor> {
  read<T>(userId: string, run: (tx: ProjectionReader) => Promise<T>): Promise<T>;
  withDevice(
    actor: Actor,
    run: (tx: ProjectionTransaction, device: ProjectionDevice) => Promise<void>,
    fence?: boolean,
  ): Promise<void>;
  /** Releases routing metadata only when this actor still owns the connection. */
  disconnect(actor: Actor): Promise<void>;
  error(code: string): Error;
}
