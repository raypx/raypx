import type {
  CloudRepository,
  CloudTransaction,
  CloudEntities,
  CloudEntityKind,
  CloudQuery,
  CloudRunEvent,
  OutboxEvent,
  ProjectV2,
  ProjectMemberV2,
  OrganizationMemberV2,
} from "@voidmix/core";
import {
  CloudDomainError,
  sameResourceScope,
  isCloudTerminal,
  sameCloudTaskRound,
} from "@voidmix/core";

type State = {
  entities: { [K in CloudEntityKind]: Map<string, CloudEntities[K]> };
  events: Map<string, CloudRunEvent>;
  outbox: Map<string, OutboxEvent>;
  users: Map<
    string,
    { active: boolean; email: string; displayName: string; role: "user" | "admin" | "owner" }
  >;
  projects: Map<string, ProjectV2>;
  members: Map<string, ProjectMemberV2>;
  organizations: Map<string, OrganizationMemberV2>;
};
const kinds: CloudEntityKind[] = [
  "mutations",
  "preferences",
  "conversations",
  "turns",
  "tasks",
  "rounds",
  "spendingGrants",
  "messages",
  "executionGrants",
  "runs",
  "executions",
  "tools",
  "sources",
  "assets",
  "revisions",
  "usage",
  "notifications",
  "commands",
];
const clone = <T>(value: T): T => structuredClone(value);
export function cloudParentIds(
  kind: CloudEntityKind,
  value: CloudEntities[CloudEntityKind],
): string[] {
  const entity = value as unknown as Record<string, unknown>;
  const keys: Record<CloudEntityKind, readonly string[]> = {
    mutations: [],
    preferences: [],
    conversations: [],
    turns: ["conversationId", "runId"],
    tasks: ["conversationId"],
    rounds: ["taskId"],
    spendingGrants: [],
    messages: ["runId"],
    executionGrants: ["runId"],
    runs: ["conversationId", "taskId"],
    executions: ["runId"],
    tools: ["runId"],
    sources: ["runId"],
    assets: ["runId"],
    revisions: ["taskId", "runId"],
    usage: ["runId"],
    notifications: ["taskId", "conversationId", "runId"],
    commands: ["runId"],
  };
  if (kind === "notifications")
    return [entity["taskId"] ?? entity["conversationId"], entity["runId"]].filter(
      (value): value is string => typeof value === "string",
    );
  return keys[kind]
    .map((key) => entity[key])
    .filter((value): value is string => typeof value === "string");
}
export function cloudActorId(
  kind: CloudEntityKind,
  value: CloudEntities[CloudEntityKind],
): string | null {
  const entity = value as unknown as Record<string, unknown>;
  const actor =
    kind === "notifications"
      ? entity["recipientId"]
      : kind === "usage"
        ? typeof entity["accountId"] === "string" && entity["accountId"].startsWith("user:")
          ? entity["accountId"].slice(5)
          : null
        : (entity["actorId"] ?? entity["requestedByUserId"] ?? entity["createdByUserId"]);
  return typeof actor === "string" ? actor : null;
}
export function cloudMatches<K extends CloudEntityKind>(
  kind: K,
  entity: CloudEntities[K],
  query: CloudQuery,
): boolean {
  const record = entity as unknown as Record<string, unknown>;
  if (
    query.ownerAccountId &&
    (kind === "usage" ? record["accountId"] : record["ownerAccountId"]) !== query.ownerAccountId
  )
    return false;
  if (query.roundId && record["roundId"] !== query.roundId) return false;
  if (
    query.published !== undefined &&
    (entity as unknown as Record<string, unknown>)["published"] !== query.published
  )
    return false;
  if (query.runIds) {
    const runId = (entity as unknown as Record<string, unknown>)["runId"];
    if (typeof runId !== "string" || !query.runIds.includes(runId)) return false;
  }
  if (query.turnIds) {
    const run = entity as unknown as Record<string, unknown>;
    const turnId = run["sourceTurnId"] ?? run["turnId"];
    if (typeof turnId !== "string" || !query.turnIds.includes(turnId)) return false;
  }
  if (query.status && (entity as unknown as Record<string, unknown>)["status"] !== query.status)
    return false;
  if (query.scope && !sameResourceScope(query.scope, entity.scope)) return false;
  if (query.parentId && !cloudParentIds(kind, entity).includes(query.parentId)) return false;
  if (query.actorId && cloudActorId(kind, entity) !== query.actorId) return false;
  if (
    query.idempotencyKey &&
    (entity as unknown as Record<string, unknown>)[
      kind === "runs" ? "turnId" : "idempotencyKey"
    ] !== query.idempotencyKey
  )
    return false;
  if (
    query.before &&
    (entity.createdAt.getTime() > query.before.createdAt.getTime() ||
      (entity.createdAt.getTime() === query.before.createdAt.getTime() &&
        entity.id >= query.before.id))
  )
    return false;
  return true;
}
function txFor(state: State): CloudTransaction {
  return {
    lock: async () => {},
    activeTaskRun: async (taskId) =>
      clone(
        [...state.entities.runs.values()].find(
          (run) => run.taskId === taskId && !isCloudTerminal(run.status),
        ) ?? null,
      ),
    readyRuns: async (limit) =>
      clone(
        [...state.entities.runs.values()]
          .filter((run) => run.status === "queued" && run.dispatchReady)
          .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id))
          .slice(0, limit),
      ),
    expiredRuns: async (now, limit) =>
      clone(
        [...state.entities.runs.values()]
          .filter(
            (run) =>
              run.status === "running" &&
              (!run.leaseExpiresAt || run.leaseExpiresAt.getTime() <= now.getTime()),
          )
          .sort((a, b) => (a.leaseExpiresAt?.getTime() ?? 0) - (b.leaseExpiresAt?.getTime() ?? 0))
          .slice(0, limit),
      ),
    get: async (kind, id) => clone(state.entities[kind].get(id) ?? null),
    list: async (kind, query = {}) =>
      clone(
        [...state.entities[kind].values()]
          .filter((entity) => cloudMatches(kind, entity, query))
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
          .slice(0, query.limit),
      ),
    remove: async (kind, id) => {
      state.entities[kind].delete(id);
    },
    save: async (kind, entity) => {
      if (kind === "rounds") {
        const prior = state.entities.rounds.get(entity.id);
        if (prior && !sameCloudTaskRound(prior, entity as CloudEntities["rounds"]))
          throw new CloudDomainError("CLOUD_INVALID_INPUT", "Task rounds are immutable.");
      }
      if (kind === "runs") {
        const run = entity as CloudEntities["runs"];
        if (
          run.taskId &&
          !isCloudTerminal(run.status) &&
          [...state.entities.runs.values()].some(
            (existing) =>
              existing.id !== run.id &&
              existing.taskId === run.taskId &&
              !isCloudTerminal(existing.status),
          )
        )
          throw new CloudDomainError("CLOUD_RUN_ACTIVE", "Task has an active run.");
      }
      (state.entities[kind] as Map<string, typeof entity>).set(entity.id, clone(entity));
    },
    userActive: async (actorId) => state.users.get(actorId)?.active === true,
    userProfile: async (actorId) => {
      const user = state.users.get(actorId);
      return user ? { email: user.email, displayName: user.displayName, role: user.role } : null;
    },
    projectAccess: async (projectId, actorId) => {
      const project = state.projects.get(projectId);
      return project
        ? clone({
            project,
            projectMember: state.members.get(`${projectId}:${actorId}`) ?? null,
            organizationMember: project.organizationId
              ? (state.organizations.get(`${project.organizationId}:${actorId}`) ?? null)
              : null,
          })
        : null;
    },
    appendEvent: async (event) => {
      if (state.events.has(`${event.runId}:${event.sequence}`))
        throw new CloudDomainError("CLOUD_IDEMPOTENCY_CONFLICT", "Event sequence already exists.");
      state.events.set(`${event.runId}:${event.sequence}`, clone(event));
    },
    events: async (runId, afterSequence, limit) =>
      clone(
        [...state.events.values()]
          .filter((e) => e.runId === runId && e.sequence > afterSequence)
          .sort((a, b) => a.sequence - b.sequence)
          .slice(0, limit),
      ),
    eventById: async (runId, eventId) =>
      clone(
        [...state.events.values()].find((e) => e.runId === runId && e.eventId === eventId) ?? null,
      ),
    eventsBefore: async (runId, beforeSequence, limit) =>
      clone(
        [...state.events.values()]
          .filter((event) => event.runId === runId && event.sequence < beforeSequence)
          .sort((a, b) => b.sequence - a.sequence)
          .slice(0, limit)
          .reverse(),
      ),
    enqueue: async (event) => {
      if (!state.outbox.has(event.id)) state.outbox.set(event.id, clone(event));
    },
  };
}
/** Tests explicitly seed trusted identities; an unknown account is never admitted. */
export class InMemoryCloudRepository implements CloudRepository {
  private state: State;
  private tail: Promise<void> = Promise.resolve();
  constructor(
    input: {
      users?: {
        id: string;
        active?: boolean;
        email?: string;
        displayName?: string;
        role?: "user" | "admin" | "owner";
      }[];
      projects?: ProjectV2[];
      projectMembers?: ProjectMemberV2[];
      organizationMembers?: OrganizationMemberV2[];
    } = {},
  ) {
    this.state = {
      entities: Object.fromEntries(kinds.map((kind) => [kind, new Map()])) as State["entities"],
      events: new Map(),
      outbox: new Map(),
      users: new Map(
        (input.users ?? []).map((u) => [
          u.id,
          {
            active: u.active ?? true,
            email: u.email ?? `${u.id}@example.com`,
            displayName: u.displayName ?? u.id,
            role: u.role ?? "user",
          },
        ]),
      ),
      projects: new Map((input.projects ?? []).map((p) => [p.id, clone(p)])),
      members: new Map(
        (input.projectMembers ?? []).map((m) => [`${m.projectId}:${m.userId}`, clone(m)]),
      ),
      organizations: new Map(
        (input.organizationMembers ?? []).map((m) => [`${m.organizationId}:${m.userId}`, clone(m)]),
      ),
    };
  }
  read<T>(operation: (tx: CloudTransaction) => Promise<T>): Promise<T> {
    return operation(txFor(clone(this.state)));
  }
  async transaction<T>(
    _keys: readonly string[],
    operation: (tx: CloudTransaction) => Promise<T>,
  ): Promise<T> {
    const before = this.tail;
    let release!: () => void;
    this.tail = new Promise((resolve) => {
      release = resolve;
    });
    await before;
    try {
      const draft = clone(this.state);
      const value = await operation(txFor(draft));
      this.state = draft;
      return clone(value);
    } finally {
      release();
    }
  }
  async outboxItems(): Promise<OutboxEvent[]> {
    return clone([...this.state.outbox.values()]);
  }
  setUserActive(actorId: string, active: boolean): void {
    const user = this.state.users.get(actorId);
    if (user) this.state.users.set(actorId, { ...user, active });
  }
}
