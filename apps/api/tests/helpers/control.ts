import { normalizeTaskJson } from "@raypx/core/task-text";
import type { AuthSession } from "@raypx/auth/types";
import {
  CONTEXT_COMMAND_TTL_MS,
  type ControlRecord,
  type ControlRepository,
  type ControlTransaction,
  type RecordKind,
} from "../../server/control/repository.js";
import type { ControlService } from "../../server/control/service.js";

import type { AgentTask, HumanRequest } from "@raypx/core/tasks";

export function memoryControlRepository(): ControlRepository & {
  validSession: boolean;
  securityVersion: string;
} {
  let data = new Map<string, ControlRecord>();
  let queue = Promise.resolve();
  const transaction = (draft: Map<string, ControlRecord>, userId: string): ControlTransaction => {
    const key = (kind: RecordKind, id: string) => `${userId}:${kind}:${id}`;
    const revoked = (id: string) => {
      const device = draft.get(key("device", id));
      return device && "revoked" in device && device.revoked === true;
    };
    return {
      async purgeObserved(deviceId) {
        for (const kind of ["observed_request", "observed_session"] as const)
          for (const item of await transaction(draft, userId).list(kind, deviceId))
            draft.delete(key(kind, item.id));
      },
      sessionActive: async () => repository.validSession,
      securityVersion: async () =>
        repository.securityVersion +
        ":" +
        ((draft.get(`${userId}:security`) as (ControlRecord & { epoch: number }) | undefined)
          ?.epoch ?? 0),
      hostSessionAllowed: async (createdAt) => {
        const state = draft.get(`${userId}:security`) as
          | (ControlRecord & { revokedAt: number })
          | undefined;
        return !state || createdAt.getTime() > state.revokedAt;
      },
      revokeHostSecurity: async () => {
        const old = draft.get(`${userId}:security`) as
          | (ControlRecord & { epoch: number })
          | undefined;
        draft.set(`${userId}:security`, {
          id: "security",
          deviceId: "security",
          epoch: (old?.epoch ?? 0) + 1,
          revokedAt: Date.now(),
        } as ControlRecord);
      },
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
              (query.ids === undefined || query.ids.includes(item.id)) &&
              (query.observedAt === undefined || !revoked(item.deviceId)) &&
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
        if (query.observedAt !== undefined)
          rows.sort(
            (a, b) =>
              Number(b.status === "pending" && (b.expiresAt ?? "") > query.observedAt!) -
                Number(a.status === "pending" && (a.expiresAt ?? "") > query.observedAt!) ||
              (b.createdAt ?? "").localeCompare(a.createdAt ?? ""),
          );
        const result = query.limit === undefined ? rows : rows.slice(0, query.limit);
        if (!query.summary) return result;
        return result.map(
          (item) =>
            Object.fromEntries(
              Object.entries(item).filter(
                ([field]) => !["body", "questions", "decision"].includes(field),
              ),
            ) as R,
        );
      },
      async put(kind, item) {
        const normalized = normalizeTaskJson(item);
        draft.set(key(kind, item.id), structuredClone(normalized));
        return normalized;
      },
      async remove(kind, id) {
        draft.delete(key(kind, id));
      },
      async pruneCommands(now) {
        const commands = await transaction(draft, userId).list<
          ControlRecord & {
            requestHash?: string;
            capturedAt?: string;
            context?: { capturedAt: string };
          }
        >("command");
        const time = (item: (typeof commands)[number]) =>
          item.capturedAt ?? item.context?.capturedAt ?? "";
        let bytes = 0,
          position = 0;
        const candidates: typeof commands = [];
        for (const item of commands
          .filter((candidate) => candidate.context && typeof candidate.context === "object")
          .sort((a, b) => time(b).localeCompare(time(a)) || b.id.localeCompare(a.id))) {
          bytes += new TextEncoder().encode(JSON.stringify(item)).byteLength;
          position++;
          if (
            time(item) > new Date(now.getTime() - CONTEXT_COMMAND_TTL_MS).toISOString() &&
            position <= 4096 &&
            bytes <= 8_388_608
          )
            continue;
          candidates.push(item);
        }
        for (const item of candidates
          .sort((a, b) => time(a).localeCompare(time(b)) || a.id.localeCompare(b.id))
          .slice(0, 1000)) {
          draft.set(key("command", item.id), {
            id: item.id,
            deviceId: item.deviceId,
            capturedAt: time(item),
            compacted: true,
            ...(item.requestHash && /^[0-9a-f]{64}$/.test(item.requestHash)
              ? { requestHash: item.requestHash }
              : {}),
          } as ControlRecord);
        }
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
  const repository: ControlRepository & { validSession: boolean; securityVersion: string } = {
    validSession: true,
    securityVersion: "initial",
    async findGrant(hash) {
      for (const [key, value] of data)
        if (key.endsWith(`:grant:${hash}`))
          return { userId: (value as ControlRecord & { userId: string }).userId };
      return undefined;
    },
    async findCredential(hash) {
      for (const [key, value] of data)
        if (key.endsWith(`:credential:${hash}`))
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
    session: {
      id: `session-${userId}`,
      userId,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
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
