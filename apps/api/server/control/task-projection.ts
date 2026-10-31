import {
  MAX_RELAY_BYTES,
  type RelayClientFrame,
  type RelayCursor,
  type RelayServerFrame,
  type SnapshotRecord,
  type SequencedEvent,
} from "@raypx/contracts/tasks";
import { taskActivityPage, applyActivityEvent } from "@raypx/core/activity";
import { type AgentEvent } from "@raypx/core/tasks";
import type { ControlRepository, ControlTransaction } from "./repository.js";

import {
  ControlError,
  type Event,
  type RelayActor,
  required,
  canonical,
  terminal,
} from "./records.js";
import type { ControlCredentials } from "./credentials.js";
import { releaseContextCommand } from "./context-receipts.js";
export class TaskProjection {
  constructor(
    private readonly repository: ControlRepository,
    private readonly clock: () => number,
    private readonly credentials: ControlCredentials,
  ) {}
  private now() {
    return new Date(this.clock()).toISOString();
  }
  /** Internal routing metadata; only PostgreSQL can assign the active connection. */
  connection(userId: string, deviceId: string) {
    return this.repository.read(userId, async (tx) => {
      const device = await tx.get("device", deviceId);
      if (!device || device.revoked || !device.connectionId) return null;
      return {
        id: device.connectionId,
        epoch: device.epoch,
        ready:
          device.initialized &&
          device.lastSeenAt !== null &&
          this.clock() - Date.parse(device.lastSeenAt) < 45_000,
      };
    });
  }
  async announce(actor: RelayActor, input: Extract<RelayClientFrame, { type: "announce" }>) {
    let snapshot = false,
      sequence = 0;
    await this.credentials.withDevice(
      actor,
      async (tx, device) => {
        snapshot = device.streamId !== input.streamId || !device.initialized;
        sequence = device.streamId !== input.streamId ? 0 : device.cursor;
        if (snapshot) device.initialized = false;
        device.streamId = input.streamId;
        device.cursor = sequence;
        device.instanceId = input.instanceId;
        device.connectionId = actor.connectionId;
        device.lastSeenAt = null;
        device.capabilities = input.capabilities;
        for (const project of await tx.list("project", device.id))
          await tx.remove("project", project.id);
        for (const project of input.projects)
          await tx.put("project", {
            ...project,
            id: `${device.id}:${project.id}`,
            deviceId: device.id,
            projectId: project.id,
          });
      },
      false,
    );
    return { type: "resume" as const, streamId: input.streamId, sequence, snapshot };
  }
  touch(actor: RelayActor) {
    return this.credentials.withDevice(actor, async (_tx, device) => {
      device.lastSeenAt = this.now();
    });
  }
  disconnect(actor: RelayActor) {
    return this.repository.deviceTransaction(actor.userId, actor.deviceId, async (tx) => {
      if (actor.role !== "device") return;
      const device = await tx.get("device", actor.deviceId);
      if (device?.connectionId === actor.connectionId) {
        device.lastSeenAt = null;
        device.connectionId = null;
        await tx.put("device", device);
      }
    });
  }
  private async record(tx: ControlTransaction, actor: RelayActor, record: SnapshotRecord) {
    if (record.kind === "task") {
      if (record.task.deviceId !== actor.deviceId) throw new ControlError("NOT_FOUND");
      const old = await tx.get("task", record.task.id);
      if (old && old.deviceId !== actor.deviceId) throw new ControlError("NOT_FOUND");
      await tx.put("task", {
        ...record.task,
        ...(record.task.activityIncomplete === undefined && old?.activityIncomplete
          ? { activityIncomplete: true }
          : {}),
        epoch: actor.epoch,
      });
      await releaseContextCommand(tx, record.task);
    } else if (record.kind === "activity") {
      await this.activity(
        tx,
        actor,
        { id: record.entry.id, taskId: record.entry.taskId, kind: "activity", entry: record.entry },
        "snapshot",
        0,
      );
    } else {
      const task = required(await tx.get("task", record.request.taskId));
      if (task.deviceId !== actor.deviceId) throw new ControlError("NOT_FOUND");
      const old = await tx.get("request", record.request.id);
      if (old && old.taskId !== task.id) throw new ControlError("NOT_FOUND");
      await tx.put("request", { ...record.request, deviceId: actor.deviceId });
    }
  }
  private async activity(
    tx: ControlTransaction,
    actor: RelayActor,
    event: Extract<AgentEvent, { kind: "activity" }>,
    streamId: string,
    cursor: number,
  ) {
    const task = required(await tx.get("task", event.taskId));
    if (task.deviceId !== actor.deviceId || event.entry.taskId !== task.id)
      throw new ControlError("NOT_FOUND");
    // Streaming revisions replace the read projection; they do not duplicate the full
    // message in cloud storage on every delta. The executor owns the replay journal.
    const id = `${actor.deviceId}:activity:${event.entry.id}`,
      old = await tx.get("event", id);
    if (old) {
      if (
        old.taskId !== task.id ||
        old.event.kind !== "activity" ||
        old.event.entry.kind !== event.entry.kind ||
        old.event.entry.order !== event.entry.order
      )
        throw new ControlError("EVENT_CONFLICT");
      if (
        old.event.entry.revision === event.entry.revision &&
        canonical(old.event.entry) !== canonical(event.entry)
      )
        throw new ControlError("EVENT_CONFLICT");
      if (old.event.entry.revision >= event.entry.revision) return;
    }
    await tx.put("event", {
      id,
      deviceId: actor.deviceId,
      taskId: task.id,
      streamId,
      cursor,
      event,
    });
  }
  async snapshot(actor: RelayActor, streamId: string, sequence: number, records: SnapshotRecord[]) {
    await this.credentials.withDevice(actor, async (tx, device) => {
      if (device.streamId !== streamId) throw new ControlError("STREAM_CHANGED");
      for (const record of records) await this.record(tx, actor, record);
      const ids = new Set(
        records.filter((record) => record.kind === "task").map((record) => record.task.id),
      );
      // The host's complete snapshot, not a server clock, resolves lost local state.
      for (const task of await tx.list("task", device.id))
        if (!ids.has(task.id) && !terminal(task))
          await tx.put("task", { ...task, status: "interrupted", updatedAt: this.now() });
      const tasks = new Map((await tx.list("task", device.id)).map((task) => [task.id, task]));
      for (const request of await tx.list("request", device.id))
        if (request.status === "pending" && terminal(required(tasks.get(request.taskId))))
          await tx.put("request", { ...request, status: "cancelled" });
      device.cursor = sequence;
      device.initialized = true;
      await tx.pruneEvents(device.id, streamId, true);
    });
  }
  async events(actor: RelayActor, streamId: string, events: SequencedEvent[]) {
    let cursor = 0;
    await this.credentials.withDevice(actor, async (tx, device) => {
      if (device.streamId !== streamId) throw new ControlError("STREAM_CHANGED");
      let previous = 0;
      for (const item of events) {
        if (item.sequence <= previous) throw new ControlError("EVENT_CONFLICT");
        previous = item.sequence;
        const key = `${device.id}:${streamId}:${item.event.id}`,
          old = await tx.get("event", key);
        if (old && canonical(old.event) !== canonical(item.event))
          throw new ControlError("EVENT_CONFLICT");
        if (item.sequence <= device.cursor) continue;
        const event = item.event;
        if (event.kind === "status") {
          if (
            event.task &&
            (event.task.id !== event.taskId ||
              event.task.status !== event.status ||
              event.task.summary !== event.summary)
          )
            throw new ControlError("INVALID_EVENT");
          if (event.task) await this.record(tx, actor, { kind: "task", task: event.task });
          else {
            const task = required(await tx.get("task", event.taskId));
            if (task.deviceId !== device.id) throw new ControlError("NOT_FOUND");
            await tx.put("task", { ...task, status: event.status, summary: event.summary });
          }
        } else if (event.kind === "request") {
          if (event.request.taskId !== event.taskId) throw new ControlError("INVALID_EVENT");
          await this.record(tx, actor, { kind: "request", request: event.request });
        } else if (event.kind === "activity_delta") {
          const projection = await tx.get("event", `${device.id}:activity:${event.entryId}`);
          const entry = applyActivityEvent(
            projection?.event.kind === "activity" ? projection.event.entry : undefined,
            event,
          );
          if (!entry) throw new ControlError("ACTIVITY_BASE_MISMATCH");
          await this.activity(
            tx,
            actor,
            { id: event.id, taskId: event.taskId, kind: "activity", entry },
            streamId,
            item.sequence,
          );
        } else if (event.kind === "activity") {
          if (event.entry.taskId !== event.taskId) throw new ControlError("INVALID_EVENT");
          await this.activity(tx, actor, event, streamId, item.sequence);
        } else {
          const request = await tx.get("request", event.requestId);
          if (request?.taskId === event.taskId && request.deviceId === device.id)
            await tx.put("request", { ...request, status: "applied" });
        }
        if (event.kind !== "activity" && event.kind !== "activity_delta")
          await tx.put("event", {
            id: key,
            deviceId: device.id,
            taskId: event.taskId,
            streamId,
            cursor: item.sequence,
            event,
          });
        device.cursor = item.sequence;
      }
      cursor = device.cursor;
      if (
        events.some(
          (item) => item.event.kind !== "activity" && item.event.kind !== "activity_delta",
        )
      )
        await tx.pruneEvents(device.id, streamId);
    });
    return cursor;
  }
  listTasks(userId: string, input: { limit: number; before?: string | undefined }) {
    return this.repository.read(userId, (tx) =>
      tx.list("task", undefined, {
        limit: input.limit,
        ...(input.before ? { beforeTask: input.before } : {}),
      }),
    );
  }
  getTask(userId: string, id: string, after: number, beforeActivity?: number) {
    return this.repository.read(userId, async (tx) => {
      const task = required(await tx.get("task", id));
      const events = await tx.list("event", task.deviceId, {
        taskId: id,
        activity: false,
        after,
        limit: 100,
      });
      const activity = await tx.list("event", task.deviceId, {
        taskId: id,
        activity: true,
        ...(beforeActivity === undefined ? {} : { beforeActivity }),
        limit: 65,
        descending: true,
      });
      return {
        task,
        ...taskActivityPage(
          activity.flatMap((item) => (item.event.kind === "activity" ? [item.event.entry] : [])),
          beforeActivity,
        ),
        events: events
          .filter((item) => item.cursor > after && item.event.kind !== "activity")
          .sort((a, b) => a.cursor - b.cursor)
          .slice(0, 100)
          .map((item) => ({ cursor: item.cursor, event: item.event })),
        requests: await tx.list("request", task.deviceId, { taskId: id }),
      };
    });
  }
  listApprovals(userId: string) {
    return this.repository.read(userId, (tx) =>
      tx.list("request", undefined, { pendingApprovals: true, limit: 100 }),
    );
  }
  replay(
    userId: string,
    cursors: RelayCursor[],
  ): Promise<Extract<RelayServerFrame, { type: "changed" }>[]> {
    return this.repository.read(userId, async (tx) => {
      const output: Extract<RelayServerFrame, { type: "changed" }>[] = [];
      for (const device of await tx.list("device")) {
        if (!device.streamId) continue;
        const cursor = cursors.find(
          (item) => item.deviceId === device.id && item.streamId === device.streamId,
        );
        const rows = (
          await tx.list("event", device.id, {
            streamId: device.streamId,
            after: cursor?.sequence ?? 0,
            limit: 51,
          })
        )
          .filter(
            (event) => event.streamId === device.streamId && event.cursor > (cursor?.sequence ?? 0),
          )
          .sort((a, b) => a.cursor - b.cursor);
        const byCursor = new Map<number, Event>();
        for (const event of rows)
          if (!byCursor.has(event.cursor) || event.event.kind === "activity")
            byCursor.set(event.cursor, event);
        const events = [...byCursor.values()];
        output.push({
          type: "changed",
          deviceId: device.id,
          streamId: device.streamId,
          sequence: device.cursor,
          ...(cursor &&
          (events.length
            ? events.every((event, index) => event.cursor === cursor.sequence + index + 1) &&
              events.at(-1)!.cursor === device.cursor
            : cursor.sequence === device.cursor) &&
          events.length <= 50 &&
          new TextEncoder().encode(JSON.stringify(events)).byteLength < MAX_RELAY_BYTES - 2048
            ? { events: events.map((event) => ({ sequence: event.cursor, event: event.event })) }
            : { reset: true }),
        });
      }
      return output;
    });
  }
}
