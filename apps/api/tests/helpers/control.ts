import { normalizeTaskJson } from "@raypx/contracts/tasks";
import type { AuthSession } from "@raypx/auth/types";
import type {
  ControlRecord,
  ControlRepository,
  ControlTransaction,
  RecordKind,
} from "../../server/control/repository.js";
import type { ControlService } from "../../server/control/service.js";
import type { AgentTask, HumanRequest } from "@raypx/contracts/tasks";

export function memoryControlRepository(): ControlRepository & { validSession: boolean } {
  let data = new Map<string, ControlRecord>();
  let queue = Promise.resolve();
  const transaction = (draft: Map<string, ControlRecord>, userId: string): ControlTransaction => {
    const key = (kind: RecordKind, id: string) => `${userId}:${kind}:${id}`;
    return {
      sessionActive: async () => repository.validSession,
      async get<R extends ControlRecord>(kind: RecordKind, id: string) {
        return structuredClone(draft.get(key(kind, id))) as R | undefined;
      },
      async list<R extends ControlRecord>(
        kind: RecordKind,
        deviceId?: string,
        query: import("../../server/control/repository.js").ControlQuery = {},
      ) {
        const rows = [...draft.entries()]
          .filter(
            ([id, item]) =>
              id.startsWith(`${userId}:${kind}:`) &&
              (deviceId === undefined || item.deviceId === deviceId),
          )
          .map(
            ([, item]) =>
              structuredClone(item) as R & {
                taskId?: string;
                createdAt?: string;
                expiresAt?: string;
                status?: string;
                streamId?: string;
                cursor?: number;
                event?: { kind: string; entry?: { order: number } };
              },
          )
          .filter(
            (item) =>
              (!query.beforeTask || `${item.createdAt}:${item.id}` < query.beforeTask) &&
              (!query.pendingApprovals ||
                (["pending", "decided"].includes(item.status ?? "") &&
                  ["pending", "running", "waiting", "cancelling"].includes(
                    (
                      draft.get(key("task", item.taskId ?? "")) as
                        | (ControlRecord & { status: string })
                        | undefined
                    )?.status ?? "",
                  ))) &&
              (query.taskId === undefined || item.taskId === query.taskId) &&
              (query.streamId === undefined || item.streamId === query.streamId) &&
              (query.activity === undefined ||
                (query.activity
                  ? item.event?.kind === "activity"
                  : !["activity", "activity_delta"].includes(item.event?.kind ?? ""))) &&
              (query.after === undefined || (item.cursor ?? 0) > query.after) &&
              (query.beforeActivity === undefined ||
                (item.event?.entry?.order ?? 0) < query.beforeActivity),
          );
        if (kind === "task")
          rows.sort(
            (a, b) =>
              (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || b.id.localeCompare(a.id),
          );
        if (query.pendingApprovals)
          rows.sort((a, b) => (a.expiresAt ?? "").localeCompare(b.expiresAt ?? ""));
        if (kind === "event")
          rows.sort(
            (a, b) =>
              ((query.activity ? a.event?.entry?.order : a.cursor) ?? 0) -
              ((query.activity ? b.event?.entry?.order : b.cursor) ?? 0),
          );
        if (query.descending) rows.reverse();
        return query.limit === undefined ? rows : rows.slice(0, query.limit);
      },
      async put(kind, item) {
        const normalized = normalizeTaskJson(item);
        draft.set(key(kind, item.id), structuredClone(normalized));
        return normalized;
      },
      async remove(kind, id) {
        draft.delete(key(kind, id));
      },
      async pruneEvents(deviceId, streamId, orphans = false) {
        const rows = await transaction(draft, userId).list<
          ControlRecord & {
            taskId: string;
            streamId: string;
            cursor: number;
            event: { kind: string };
          }
        >("event", deviceId);
        let bytes = 0,
          count = 0;
        for (const item of rows.sort((a, b) => b.cursor - a.cursor)) {
          if (orphans && !draft.has(key("task", item.taskId))) draft.delete(key("event", item.id));
          else if (item.event.kind === "activity_delta") draft.delete(key("event", item.id));
          else if (item.event.kind !== "activity") {
            bytes += new TextEncoder().encode(JSON.stringify(item)).byteLength;
            if (++count > 4096 || bytes > 8 * 1024 * 1024 || item.streamId !== streamId)
              draft.delete(key("event", item.id));
          }
        }
      },
    };
  };
  const repository: ControlRepository & { validSession: boolean } = {
    validSession: true,
    async findGrant(hash) {
      for (const [key, value] of data)
        if (key.endsWith(`:grant:${hash}`))
          return { userId: (value as ControlRecord & { userId: string }).userId };
      return undefined;
    },

    read: (userId, run) => run(transaction(structuredClone(data), userId)),
    transaction<T>(userId: string, run: (tx: ControlTransaction) => Promise<T>): Promise<T> {
      const result = queue.then(async () => {
        const draft = structuredClone(data);
        const value = await run(transaction(draft, userId));
        data = draft;
        return value;
      });
      queue = result.then(
        () => {},
        () => {},
      );
      return result;
    },
  };
  return repository;
}
export function controlAuth(userId = "user-a"): AuthSession {
  return {
    user: { id: userId, email: `${userId}@example.com`, name: userId, emailVerified: true },
    session: { id: `session-${userId}`, userId, expiresAt: new Date(Date.now() + 3_600_000) },
  };
}
export async function connected(service: ControlService, auth = controlAuth()) {
  const installationId = crypto.randomUUID();
  const grant = await service.register(auth, {
    installationId,
    name: "Computer",
    platform: "darwin",
    appVersion: "0.1.0",
    reconnect: false,
  });
  const actor = await service.authenticate("device", grant.token, crypto.randomUUID());
  const projectId = crypto.randomUUID();
  const announce = {
    type: "announce" as const,
    streamId: crypto.randomUUID(),
    instanceId: crypto.randomUUID(),
    projects: [
      {
        id: projectId,
        name: "Project",
        providers: ["codex" as const, "claude" as const],
        dirty: true,
      },
    ],
    capabilities: [
      { provider: "codex" as const, available: true, version: "0.163.0", reason: "ready" as const },
    ],
  };
  await service.announce(actor, announce);
  await service.snapshot(actor, announce.streamId, 0, []);
  await service.touch(actor);
  const input = {
    id: crypto.randomUUID(),
    deviceId: grant.deviceId,
    projectId,
    provider: "codex" as const,
    mode: "run" as const,
    prompt: "Implement feature",
  };
  return { grant, actor, announce, input, auth, installationId };
}
export async function running(
  service: ControlService,
  fixture: Awaited<ReturnType<typeof connected>>,
) {
  const task: AgentTask = {
    ...fixture.input,
    parentTaskId: null,
    status: "running",
    summary: "",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await service.events(fixture.actor, fixture.announce.streamId, [
    {
      sequence: 1,
      event: {
        id: crypto.randomUUID(),
        taskId: task.id,
        kind: "status",
        status: "running",
        summary: "",
        task,
      },
    },
  ]);
  return task;
}
export function humanRequest(task: AgentTask): HumanRequest {
  return {
    id: crypto.randomUUID(),
    taskId: task.id,
    kind: "permission",
    title: "Run tests",
    body: "bun test",
    questions: [],
    expiresAt: new Date(Date.now() + 300_000).toISOString(),
    status: "pending",
    decision: null,
  };
}
