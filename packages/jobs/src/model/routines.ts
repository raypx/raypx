import { nextJobRuns } from "@raypx/core/jobs";
import {
  routineInputSchema,
  type Routine,
  type RoutineInput,
  type RoutineHistory,
  type RoutineEvent,
  type RoutineDeliveryOutcome,
} from "@raypx/core/routines";

export interface RoutineMutation {
  routine: Routine;
  webhookKey: string | null;
  repositorySecret: string | null;
}

/** The session transport supplies these operations; all admission stays on the server. */
export interface RoutinesPort {
  list(
    this: void,
    input: { spaceId: string; agentId?: string; limit?: number },
  ): Promise<Routine[]>;
  get(this: void, input: { spaceId: string; id: string }): Promise<Routine>;
  create(this: void, input: { spaceId: string; routine: RoutineInput }): Promise<RoutineMutation>;
  update(
    this: void,
    input: { spaceId: string; id: string; routine: RoutineInput },
  ): Promise<RoutineMutation>;
  pause(this: void, input: { spaceId: string; id: string }): Promise<Routine>;
  resume(this: void, input: { spaceId: string; id: string }): Promise<Routine>;
  delete(this: void, input: { spaceId: string; id: string }): Promise<{ deleted: true }>;
  test(
    this: void,
    input: {
      spaceId: string;
      id: string;
      idempotencyKey: string;
    },
  ): Promise<RoutineDeliveryOutcome>;
  rotateWebhookKey(
    this: void,
    input: {
      spaceId: string;
      id: string;
    },
  ): Promise<{ routine: Routine; webhookKey: string }>;
  history(
    this: void,
    input: { spaceId: string; id: string; limit?: number },
  ): Promise<RoutineHistory[]>;
  events(
    this: void,
    input: { spaceId: string; id: string; limit?: number },
  ): Promise<RoutineEvent[]>;
}

export type RoutineTriggerKind = "schedule" | "webhook" | "email" | "repository";
export const routineTriggerKinds: readonly RoutineTriggerKind[] = [
  "schedule",
  "webhook",
  "email",
  "repository",
];
export interface RoutineFormState {
  name: string;
  prompt: string;
  enabled: boolean;
  selected: Record<RoutineTriggerKind, boolean>;
  cron: string;
  timezone: string;
  allowedSender: string;
  repositoryEvents: string;
}

export function createRoutineForm(routine: Routine | null, browserZone: string): RoutineFormState {
  return {
    name: routine?.name ?? "",
    prompt: routine?.prompt ?? "",
    enabled: routine?.enabled ?? true,
    selected: {
      schedule: Boolean(routine?.triggers.schedule ?? !routine),
      webhook: Boolean(routine?.triggers.webhook),
      email: Boolean(routine?.triggers.email),
      repository: Boolean(routine?.triggers.repository),
    },
    cron: routine?.triggers.schedule?.cron ?? "0 9 * * 1-5",
    timezone: routine?.triggers.schedule?.timezone ?? browserZone,
    allowedSender: routine?.triggers.email?.allowedSender ?? "",
    repositoryEvents: routine?.triggers.repository?.events.join(", ") ?? "push",
  };
}

export function routineFormInput(form: RoutineFormState, agentId: string): RoutineInput | null {
  const result = routineInputSchema.safeParse({
    agentId,
    name: form.name,
    prompt: form.prompt,
    enabled: form.enabled,
    triggers: {
      ...(form.selected.schedule ? { schedule: { cron: form.cron, timezone: form.timezone } } : {}),
      ...(form.selected.webhook ? { webhook: true } : {}),
      ...(form.selected.email ? { email: { allowedSender: form.allowedSender } } : {}),
      ...(form.selected.repository
        ? {
            repository: {
              events: form.repositoryEvents
                .split(",")
                .map((event) => event.trim())
                .filter(Boolean),
            },
          }
        : {}),
    },
  });
  return result.success ? result.data : null;
}

export function routineOccurrences(cron: string, timezone: string, now: Date): string[] {
  try {
    return nextJobRuns({ cron, timezone }, now, 3);
  } catch {
    return [];
  }
}

export function routineHistoryState(
  history: RoutineHistory,
): "started" | "joined" | "filtered" | "queued" {
  if (history.status === "coalesced") return "joined";
  if (history.status === "ignored") return "filtered";
  return history.startedAt ? "started" : "queued";
}

/** Occurrence disposition and the linked Run's current outcome are separate. */
export function routineLastOutcome(
  history: RoutineHistory,
):
  | ReturnType<typeof routineHistoryState>
  | "completed"
  | "failed"
  | "cancelled"
  | "running"
  | "waiting" {
  if (history.status === "ignored") return "filtered";
  switch (history.runState) {
    case "succeeded":
      return "completed";
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "running":
      return "running";
    case "waiting":
      return "waiting";
    case "queued":
      return "queued";
    case null:
      return routineHistoryState(history);
    default:
      return routineHistoryState(history);
  }
}

export function routineDelayMinutes(history: RoutineHistory): number | null {
  if (!history.startedAt || history.delayMs === null || history.delayMs < 60_000) return null;
  return Math.floor(history.delayMs / 60_000);
}

export interface RoutineSecrets {
  webhookKey: string | null;
  repositorySecret: string | null;
}
export function clearRoutineSecrets(): RoutineSecrets {
  return { webhookKey: null, repositorySecret: null };
}
export function revealedRoutineSecrets(result: RoutineSecrets): RoutineSecrets {
  return { webhookKey: result.webhookKey, repositorySecret: result.repositorySecret };
}

export function routineErrorKey(
  error: unknown,
):
  | "bodyMismatch"
  | "disabled"
  | "payloadTooLarge"
  | "rateLimited"
  | "invalidInput"
  | "notFound"
  | "unauthorized"
  | "requestFailed" {
  if (!error || typeof error !== "object") return "requestFailed";
  const value = error as {
    code?: unknown;
    message?: unknown;
    data?: { code?: unknown; error?: { code?: unknown } };
  };
  for (const code of [value.data?.error?.code, value.data?.code, value.message, value.code]) {
    switch (code) {
      case "BODY_MISMATCH":
        return "bodyMismatch";
      case "DISABLED":
        return "disabled";
      case "PAYLOAD_TOO_LARGE":
        return "payloadTooLarge";
      case "RATE_LIMITED":
      case "TOO_MANY_REQUESTS":
        return "rateLimited";
      case "INVALID_INPUT":
        return "invalidInput";
      case "NOT_FOUND":
        return "notFound";
      case "UNAUTHORIZED":
        return "unauthorized";
    }
  }
  return "requestFailed";
}
