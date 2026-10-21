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
  const repository = {
    validSession: true,
    async findGrant(hash: string) {
      for (const [key, value] of data)
        if (key.endsWith(`:grant:${hash}`))
          return { userId: (value as ControlRecord & { userId: string }).userId };
      return undefined;
    },
    transaction<T>(userId: string, run: (tx: ControlTransaction) => Promise<T>): Promise<T> {
      const result = queue.then(async () => {
        const draft = structuredClone(data);
        const key = (kind: RecordKind, id: string) => `${userId}:${kind}:${id}`;
        const value = await run({
          sessionActive: async () => repository.validSession,
          async get<R extends ControlRecord>(kind: RecordKind, id: string) {
            return structuredClone(draft.get(key(kind, id))) as R | undefined;
          },
          async list<R extends ControlRecord>(kind: RecordKind, deviceId?: string) {
            return [...draft.entries()]
              .filter(
                ([id, item]) =>
                  id.startsWith(`${userId}:${kind}:`) &&
                  (deviceId === undefined || item.deviceId === deviceId),
              )
              .map(([, item]) => structuredClone(item) as R);
          },
          async put(kind, item) {
            draft.set(key(kind, item.id), structuredClone(item));
            return item;
          },
          async remove(kind, id) {
            draft.delete(key(kind, id));
          },
        });
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
