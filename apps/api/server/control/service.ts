import type { AuthSession } from "@raypx/auth/types";
import {
  normalizeTaskJson,
  taskActivityPage,
  applyActivityEvent,
  activeTaskStatuses,
  MAX_RELAY_BYTES,
  type AgentTask,
  type AgentEvent,
  type DeviceGrant,
  type HumanRequest,
  type RelayClientFrame,
  type RelayCommand,
  type RelayCursor,
  type RelayRequest,
  type RelayServerFrame,
  type SnapshotRecord,
  type SequencedEvent,
} from "@raypx/contracts/tasks";
import type {
  ControlRecord,
  ControlRepository,
  ControlTransaction,
  ControlReader,
} from "./repository.js";

export class ControlError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
interface Device extends ControlRecord {
  installationId: string;
  name: string;
  platform: string;
  appVersion: string;
  epoch: number;
  revoked: boolean;
  lastSeenAt: string | null;
  streamId: string | null;
  instanceId: string | null;
  connectionId: string | null;
  cursor: number;
  initialized: boolean;
  capabilities: Extract<RelayClientFrame, { type: "announce" }>["capabilities"];
}
interface Grant extends ControlRecord {
  userId: string;
  sessionId: string;
  epoch: number;
  expiresAt: string;
  parentExpiresAt: string;
  role: "device" | "viewer";
}
interface Task extends AgentTask {
  epoch: number;
}
interface Project extends ControlRecord {
  projectId: string;
  name: string;
  providers: ("codex" | "claude")[];
  dirty: boolean;
}
interface StoredRequest extends HumanRequest {
  deviceId: string;
}
interface Event extends ControlRecord {
  taskId: string;
  streamId: string;
  cursor: number;
  event: AgentEvent;
}
export interface RelayActor {
  role: "viewer" | "device";
  userId: string;
  sessionId: string;
  deviceId: string;
  epoch: number;
  grantId: string;
  expiresAt: string;
  connectionId: string;
}
const required = <T>(value: T | undefined): T => {
  if (!value) throw new ControlError("NOT_FOUND");
  return value;
};
const hash = async (value: string) =>
  Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
const canonical = (value: unknown) =>
  JSON.stringify(normalizeTaskJson(value), (_key, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );
const terminal = (task: AgentTask) => !activeTaskStatuses.includes(task.status);
export class ControlService {
  constructor(
    private readonly repository: ControlRepository,
    private readonly clock: () => number = Date.now,
  ) {}
  private now() {
    return new Date(this.clock()).toISOString();
  }
  private async issue(
    tx: ControlTransaction,
    auth: AuthSession,
    deviceId: string,
    epoch: number,
    role: "device" | "viewer",
  ) {
    const token = crypto.randomUUID() + crypto.randomUUID();
    const expiresAt = new Date(
      Math.min(
        this.clock() + (role === "device" ? 600_000 : 30_000),
        auth.session.expiresAt.getTime(),
      ),
    ).toISOString();
    for (const grant of await tx.list<Grant>("grant", deviceId))
      if (Date.parse(grant.expiresAt) <= this.clock()) await tx.remove("grant", grant.id);
    await tx.put("grant", {
      id: await hash(token),
      deviceId,
      userId: auth.user.id,
      sessionId: auth.session.id,
      epoch,
      expiresAt,
      parentExpiresAt: auth.session.expiresAt.toISOString(),
      role,
    });
    return { token, expiresAt };
  }
  ticket(auth: AuthSession) {
    return this.repository.transaction(auth.user.id, (tx) =>
      this.issue(tx, auth, "viewer", 0, "viewer"),
    );
  }
  register(
    auth: AuthSession,
    input: {
      installationId: string;
      name: string;
      platform: string;
      appVersion: string;
      reconnect: boolean;
    },
  ): Promise<DeviceGrant> {
    return this.repository.transaction(auth.user.id, async (tx) => {
      let device = (await tx.list<Device>("device")).find(
        (value) => value.installationId === input.installationId,
      );
      if (device?.revoked && !input.reconnect) throw new ControlError("DEVICE_REVOKED");
      if (!device) {
        const id = crypto.randomUUID();
        device = {
          id,
          deviceId: id,
          installationId: input.installationId,
          name: input.name,
          platform: input.platform,
          appVersion: input.appVersion,
          epoch: 1,
          revoked: false,
          lastSeenAt: null,
          streamId: null,
          instanceId: null,
          connectionId: null,
          cursor: 0,
          initialized: false,
          capabilities: [],
        };
      } else if (device.revoked) {
        device.epoch++;
        device.revoked = false;
        device.lastSeenAt = null;
        device.streamId = null;
        device.cursor = 0;
      }
      Object.assign(device, {
        name: input.name,
        platform: input.platform,
        appVersion: input.appVersion,
      });
      await tx.put("device", device);
      return {
        deviceId: device.id,
        epoch: device.epoch,
        ...(await this.issue(tx, auth, device.id, device.epoch, "device")),
      };
    });
  }
  refreshGrant(auth: AuthSession, input: { deviceId: string; epoch: number }) {
    return this.repository.transaction(auth.user.id, async (tx) => {
      const device = required(await tx.get<Device>("device", input.deviceId));
      if (device.revoked || device.epoch !== input.epoch) throw new ControlError("DEVICE_REVOKED");
      return {
        deviceId: device.id,
        epoch: device.epoch,
        ...(await this.issue(tx, auth, device.id, device.epoch, "device")),
      };
    });
  }
  async authenticate(
    role: RelayActor["role"],
    token: string,
    connectionId: string,
  ): Promise<RelayActor> {
    const grantId = await hash(token),
      owner = await this.repository.findGrant(grantId);
    if (!owner) throw new ControlError("AUTH_REQUIRED");
    return this.repository.transaction(owner.userId, async (tx) => {
      const grant = await tx.get<Grant>("grant", grantId);
      if (
        !grant ||
        grant.role !== role ||
        Date.parse(grant.expiresAt) <= this.clock() ||
        !(await tx.sessionActive(grant.sessionId, new Date(this.clock())))
      )
        throw new ControlError("AUTH_REQUIRED");
      if (role === "device") {
        const device = required(await tx.get<Device>("device", grant.deviceId));
        if (device.revoked || device.epoch !== grant.epoch)
          throw new ControlError("DEVICE_REVOKED");
      } else await tx.remove("grant", grantId);
      return {
        role,
        userId: owner.userId,
        deviceId: grant.deviceId,
        epoch: grant.epoch,
        sessionId: grant.sessionId,
        grantId,
        expiresAt: role === "viewer" ? grant.parentExpiresAt : grant.expiresAt,
        connectionId,
      };
    });
  }
  private async check(tx: ControlReader, actor: RelayActor) {
    if (
      Date.parse(actor.expiresAt) <= this.clock() ||
      !(await tx.sessionActive(actor.sessionId, new Date(this.clock())))
    )
      throw new ControlError("AUTH_REQUIRED");
    if (actor.role === "device") {
      const device = required(await tx.get<Device>("device", actor.deviceId));
      if (device.revoked || device.epoch !== actor.epoch) throw new ControlError("DEVICE_REVOKED");
      if (!(await tx.get<Grant>("grant", actor.grantId))) throw new ControlError("AUTH_REQUIRED");
    }
  }
  validate(actor: RelayActor) {
    return this.repository.read(actor.userId, (tx) => this.check(tx, actor));
  }
  private device(
    actor: RelayActor,
    run: (tx: ControlTransaction, device: Device) => Promise<void>,
    fence = true,
  ) {
    if (actor.role !== "device") throw new ControlError("FORBIDDEN");
    return this.repository.transaction(actor.userId, async (tx) => {
      await this.check(tx, actor);
      const device = required(await tx.get<Device>("device", actor.deviceId));
      if (fence && device.connectionId !== actor.connectionId)
        throw new ControlError("DEVICE_REPLACED");
      await run(tx, device);
      await tx.put("device", device);
    });
  }
  async announce(actor: RelayActor, input: Extract<RelayClientFrame, { type: "announce" }>) {
    let snapshot = false,
      sequence = 0;
    await this.device(
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
        for (const project of await tx.list<Project>("project", device.id))
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
    return this.device(actor, async (_tx, device) => {
      device.lastSeenAt = this.now();
    });
  }
  disconnect(actor: RelayActor) {
    return this.repository.transaction(actor.userId, async (tx) => {
      if (actor.role !== "device") return;
      const device = await tx.get<Device>("device", actor.deviceId);
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
      const old = await tx.get<Task>("task", record.task.id);
      if (old && old.deviceId !== actor.deviceId) throw new ControlError("NOT_FOUND");
      await tx.put("task", {
        ...record.task,
        ...(record.task.activityIncomplete === undefined && old?.activityIncomplete
          ? { activityIncomplete: true }
          : {}),
        epoch: actor.epoch,
      });
    } else if (record.kind === "activity") {
      await this.activity(
        tx,
        actor,
        { id: record.entry.id, taskId: record.entry.taskId, kind: "activity", entry: record.entry },
        "snapshot",
        0,
      );
    } else {
      const task = required(await tx.get<Task>("task", record.request.taskId));
      if (task.deviceId !== actor.deviceId) throw new ControlError("NOT_FOUND");
      const old = await tx.get<StoredRequest>("request", record.request.id);
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
    const task = required(await tx.get<Task>("task", event.taskId));
    if (task.deviceId !== actor.deviceId || event.entry.taskId !== task.id)
      throw new ControlError("NOT_FOUND");
    // Streaming revisions replace the read projection; they do not duplicate the full
    // message in cloud storage on every delta. The executor owns the replay journal.
    const id = `${actor.deviceId}:activity:${event.entry.id}`,
      old = await tx.get<Event>("event", id);
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
    await tx.put<Event>("event", {
      id,
      deviceId: actor.deviceId,
      taskId: task.id,
      streamId,
      cursor,
      event,
    });
  }
  async snapshot(actor: RelayActor, streamId: string, sequence: number, records: SnapshotRecord[]) {
    await this.device(actor, async (tx, device) => {
      if (device.streamId !== streamId) throw new ControlError("STREAM_CHANGED");
      for (const record of records) await this.record(tx, actor, record);
      const ids = new Set(
        records.filter((record) => record.kind === "task").map((record) => record.task.id),
      );
      // The host's complete snapshot, not a server clock, resolves lost local state.
      for (const task of await tx.list<Task>("task", device.id))
        if (!ids.has(task.id) && !terminal(task))
          await tx.put("task", { ...task, status: "interrupted", updatedAt: this.now() });
      const tasks = new Map(
        (await tx.list<Task>("task", device.id)).map((task) => [task.id, task]),
      );
      for (const request of await tx.list<StoredRequest>("request", device.id))
        if (request.status === "pending" && terminal(required(tasks.get(request.taskId))))
          await tx.put("request", { ...request, status: "cancelled" });
      device.cursor = sequence;
      device.initialized = true;
      await tx.pruneEvents(device.id, streamId, true);
    });
  }
  async events(actor: RelayActor, streamId: string, events: SequencedEvent[]) {
    let cursor = 0;
    await this.device(actor, async (tx, device) => {
      if (device.streamId !== streamId) throw new ControlError("STREAM_CHANGED");
      let previous = 0;
      for (const item of events) {
        if (item.sequence <= previous) throw new ControlError("EVENT_CONFLICT");
        previous = item.sequence;
        const key = `${device.id}:${streamId}:${item.event.id}`,
          old = await tx.get<Event>("event", key);
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
            const task = required(await tx.get<Task>("task", event.taskId));
            if (task.deviceId !== device.id) throw new ControlError("NOT_FOUND");
            await tx.put("task", { ...task, status: event.status, summary: event.summary });
          }
        } else if (event.kind === "request") {
          if (event.request.taskId !== event.taskId) throw new ControlError("INVALID_EVENT");
          await this.record(tx, actor, { kind: "request", request: event.request });
        } else if (event.kind === "activity_delta") {
          const projection = await tx.get<Event>("event", `${device.id}:activity:${event.entryId}`);
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
          const request = await tx.get<StoredRequest>("request", event.requestId);
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
  route(userId: string, id: string, request: RelayRequest): Promise<RelayCommand> {
    return this.repository.transaction(userId, async (tx) => {
      let deviceId: string;
      if (request.method === "tasks.create") deviceId = request.input.deviceId;
      else if (request.method === "approvals.decide")
        deviceId = required(await tx.get<StoredRequest>("request", request.input.id)).deviceId;
      else
        deviceId = required(
          await tx.get<Task>(
            "task",
            request.method === "tasks.cancel"
              ? request.input.id
              : request.method === "tasks.input"
                ? request.input.taskId
                : request.input.parentTaskId,
          ),
        ).deviceId;
      const device = required(await tx.get<Device>("device", deviceId));
      if (device.revoked) throw new ControlError("DEVICE_REVOKED");
      if (
        (request.method === "tasks.create" ||
          request.method === "tasks.followUp" ||
          request.method === "tasks.input") &&
        id !== request.input.id
      )
        throw new ControlError("IDEMPOTENCY_CONFLICT");
      return { id, deviceId, expiresAt: new Date(this.clock() + 15_000).toISOString(), request };
    });
  }
  listDevices(userId: string) {
    return this.repository.read(userId, async (tx) =>
      Promise.all(
        (await tx.list<Device>("device")).map(async (device) => ({
          id: device.id,
          name: device.name,
          platform: device.platform,
          appVersion: device.appVersion,
          epoch: device.epoch,
          revoked: device.revoked,
          lastSeenAt: device.lastSeenAt,
          online:
            !device.revoked &&
            device.lastSeenAt !== null &&
            this.clock() - Date.parse(device.lastSeenAt) < 45_000,
          capabilities: device.capabilities,
          projects: (await tx.list<Project>("project", device.id)).map((project) => ({
            id: project.projectId,
            name: project.name,
            providers: project.providers,
            dirty: project.dirty,
          })),
        })),
      ),
    );
  }
  revoke(userId: string, input: { deviceId: string; epoch: number }) {
    return this.repository.transaction(userId, async (tx) => {
      const device = required(await tx.get<Device>("device", input.deviceId));
      if (device.epoch !== input.epoch) throw new ControlError("DEVICE_REVOKED");
      device.revoked = true;
      device.lastSeenAt = null;
      await tx.put("device", device);
      for (const grant of await tx.list<Grant>("grant", device.id))
        await tx.remove("grant", grant.id);
      return { revoked: true as const };
    });
  }
  listTasks(userId: string, input: { limit: number; before?: string | undefined }) {
    return this.repository.read(userId, (tx) =>
      tx.list<Task>("task", undefined, {
        limit: input.limit,
        ...(input.before ? { beforeTask: input.before } : {}),
      }),
    );
  }
  getTask(userId: string, id: string, after: number, beforeActivity?: number) {
    return this.repository.read(userId, async (tx) => {
      const task = required(await tx.get<Task>("task", id));
      const events = await tx.list<Event>("event", task.deviceId, {
        taskId: id,
        activity: false,
        after,
        limit: 100,
      });
      const activity = await tx.list<Event>("event", task.deviceId, {
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
        requests: await tx.list<StoredRequest>("request", task.deviceId, { taskId: id }),
      };
    });
  }
  listApprovals(userId: string) {
    return this.repository.read(userId, (tx) =>
      tx.list<StoredRequest>("request", undefined, { pendingApprovals: true, limit: 100 }),
    );
  }
  replay(
    userId: string,
    cursors: RelayCursor[],
  ): Promise<Extract<RelayServerFrame, { type: "changed" }>[]> {
    return this.repository.read(userId, async (tx) => {
      const output: Extract<RelayServerFrame, { type: "changed" }>[] = [];
      for (const device of await tx.list<Device>("device")) {
        if (!device.streamId) continue;
        const cursor = cursors.find(
          (item) => item.deviceId === device.id && item.streamId === device.streamId,
        );
        const rows = (
          await tx.list<Event>("event", device.id, {
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
