import {
  activeTaskStatuses,
  validDecision,
  type HumanRequest,
  type TaskActivity,
} from "@raypx/core/tasks";
import type { Effect, EffectCommand, LiveFacts, OrchestrationCommand } from "./commands";
import type { OrchestrationEvent } from "./events";
import type { LocalAgentTask } from "./state";

/** The live-process facts a decision reads; none of them touch storage. */
export interface DecideFacts {
  /** Identity source for events the decider creates. */
  nextId(): string;
  now(): string;
}

/** State available inside the committing transaction. */
export interface DecideState {
  binding: string;
  task: LocalAgentTask | undefined;
  /** Open requests for the task, in storage order. */
  requests: HumanRequest[];
  activity: TaskActivity[];
  /** Decisions resolve an approval, so the live handle must still hold it. */
  live: LiveFacts;
}

export interface Decision {
  events: OrchestrationEvent[];
  /** Effects in commit order. The sink attaches a durable `effectId` to each. */
  effects: (Effect & { effectId?: string })[];
  /** The value a caller receives once the commit succeeds. */
  result: unknown;
}

/** A rejected command. It commits nothing; the caller maps it to a result code. */
export class DecisionRejected extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = "DecisionRejected";
  }
}

const settledInputStatus = (
  entry: Extract<TaskActivity, { kind: "input" }>,
  inputCode: Extract<TaskActivity, { kind: "input" }>["code"],
) =>
  entry.status === "sending"
    ? { status: "interrupted" as const, code: inputCode }
    : { status: "cancelled" as const, code: inputCode };

const none = (): Decision => ({ events: [], effects: [], result: undefined });

/**
 * `decide(state, command, facts)` is pure: it reads no clock, storage or process
 * handle. Live process state arrives as `state.live`. It returns the events a
 * commit must apply and the effects the worker runs afterwards.
 */
export function decide(
  state: DecideState,
  command: OrchestrationCommand | EffectCommand,
  facts: DecideFacts,
): Decision {
  const at = facts.now();
  switch (command.type) {
    // Entry commands: start, cancel, decision, input.
    case "start":
      if (state.live.closing) throw new DecisionRejected("CLOSING");
      if (state.live.active(command.task.id)) throw new DecisionRejected("PROJECT_BUSY");
      return {
        events: [
          {
            type: "task.accepted",
            id: facts.nextId(),
            binding: command.binding,
            at,
            taskId: command.task.id,
            task: command.task,
            sessionId: null,
            receiptId: command.commandId,
          },
        ],
        effects: [
          {
            type: "execution.start",
            binding: command.binding,
            commandId: command.commandId,
            taskId: command.task.id,
            deadline: command.deadline,
          },
        ],
        result: { accepted: true },
      };
    case "cancel": {
      const task = state.task;
      // A task that already left the active statuses has nothing to cancel.
      if (!task || !activeTaskStatuses.includes(task.task.status)) return none();
      if (task.task.status === "cancelling") return { ...none(), result: { accepted: true } };
      const cancelling: LocalAgentTask = { ...task, task: { ...task.task, status: "cancelling" } };
      const status = thisStatus(facts, command.binding, cancelling);
      return {
        events: [status, ...settleOpenWork(state, cancelling, "TASK_STOPPED", at, facts)],
        effects: [
          {
            type: "execution.cancel",
            binding: command.binding,
            commandId: command.commandId,
            taskId: task.task.id,
          },
        ],
        result: { accepted: true },
      };
    }
    case "decision": {
      const request = state.requests.find((entry) => entry.id === command.requestId);
      if (!request) throw new DecisionRejected("NOT_FOUND");
      if (!validDecision(request, command.decision)) throw new DecisionRejected("INVALID_ANSWER");
      // A retried identical decision reports the stored request, never a second effect.
      if (
        ["decided", "applied"].includes(request.status) &&
        JSON.stringify(request.decision) === JSON.stringify(command.decision)
      )
        return { ...none(), result: request };
      if (request.status === "expired") throw new DecisionRejected("REQUEST_EXPIRED");
      if (request.status !== "pending") throw new DecisionRejected("ALREADY_RESOLVED");
      const task = state.task;
      if (
        !task ||
        !activeTaskStatuses.includes(task.task.status) ||
        task.task.status === "cancelling"
      )
        throw new DecisionRejected("REQUEST_CLOSED");
      if (Date.parse(request.expiresAt) <= Date.parse(at))
        throw new DecisionRejected("REQUEST_EXPIRED");
      if (!state.live.active(task.task.id) || !state.live.pending(task.task.id, request.id))
        throw new DecisionRejected("REQUEST_CLOSED");
      const decided: HumanRequest = {
        ...request,
        status: "applied",
        decision: command.decision,
      };
      return {
        events: [
          ...(command.recordDecided
            ? [
                {
                  type: "request.decided" as const,
                  id: facts.nextId(),
                  binding: command.binding,
                  taskId: task.task.id,
                  at,
                  request: { ...request, status: "decided" as const, decision: command.decision },
                },
              ]
            : []),
          {
            type: "request.applied",
            id: facts.nextId(),
            binding: command.binding,
            taskId: task.task.id,
            at,
            request: decided,
            decision: command.decision,
          },
        ],
        // The provider hears the answer only after the applied decision commits.
        effects: [
          {
            type: "provider.request.respond",
            binding: command.binding,
            commandId: command.commandId,
            taskId: task.task.id,
            requestId: request.id,
            decision: command.decision,
          },
        ],
        result: decided,
      };
    }
    case "input":
      // Input delivery is decided by the harness state machine, which owns the
      // turn queue; the decider only records the accepted command receipt.
      return none();

    case "task.accept":
      return {
        events: [
          {
            type: "task.accepted",
            id: facts.nextId(),
            binding: command.binding,
            at,
            taskId: command.task.task.id,
            task: command.task.task,
            sessionId: command.task.sessionId,
            receiptId: command.receiptId,
          },
        ],
        effects: [],
        result: undefined,
      };
    case "task.transition": {
      const task = command.task;
      return {
        events: [
          thisStatus(facts, command.binding, task),
          ...(state.task ? settleOpenWork(state, task, command.inputCode, at, facts) : []),
        ],
        effects: [],
        result: undefined,
      };
    }
    case "task.session":
      return {
        events: [
          {
            type: "task.sessionBound",
            id: facts.nextId(),
            binding: command.binding,
            at,
            taskId: command.task.task.id,
            task: command.task.task,
            sessionId: command.sessionId,
            ...(command.tokenUsage ? { tokenUsage: command.tokenUsage } : {}),
          },
        ],
        effects: [],
        result: undefined,
      };
    case "task.mode":
      return {
        events: [
          {
            type: "task.modeChanged",
            id: facts.nextId(),
            binding: command.binding,
            at,
            taskId: command.task.task.id,
            task: command.task.task,
            sessionId: command.task.sessionId,
            mode: command.mode,
          },
        ],
        effects: [],
        result: undefined,
      };
    case "task.usage":
      return {
        events: [
          {
            type: "task.tokenUsage",
            id: facts.nextId(),
            binding: command.binding,
            at,
            taskId: command.task.task.id,
            task: command.task.task,
            sessionId: command.task.sessionId,
            totals: command.totals,
          },
        ],
        effects: [],
        result: undefined,
      };
    case "activity.record":
      return {
        events: [
          {
            type: "activity.recorded",
            id: facts.nextId(),
            binding: command.binding,
            at,
            taskId: command.draft.taskId,
            entry: command.draft as TaskActivity,
          },
        ],
        effects: [],
        // The sink replaces this with the stored entry, once order and revision exist.
        result: command.draft,
      };
    case "request.record":
      return {
        events: [
          {
            type: "request.opened",
            id: facts.nextId(),
            binding: command.binding,
            at,
            taskId: command.request.taskId,
            request: command.request,
          },
        ],
        effects: [],
        result: undefined,
      };
  }
}

/** The `status` wire event for a task change; its identity is the journal identity. */
function thisStatus(
  facts: DecideFacts,
  _binding: string,
  task: LocalAgentTask,
): Extract<OrchestrationEvent, { type: "task.statusChanged" }> {
  return {
    type: "task.statusChanged",
    id: facts.nextId(),
    binding: task.binding,
    at: facts.now(),
    taskId: task.task.id,
    task: task.task,
    sessionId: task.sessionId,
    settledRequests: [],
    settledActivity: [],
  };
}

/**
 * The work an inactive status ends: open requests become cancelled, and queued
 * or streaming activity becomes interrupted. These are separate events so a wire
 * consumer sees the same request and activity records it sees today.
 */
function settleOpenWork(
  state: DecideState,
  task: LocalAgentTask,
  inputCode: Extract<TaskActivity, { kind: "input" }>["code"],
  at: string,
  facts: DecideFacts,
): OrchestrationEvent[] {
  if (activeTaskStatuses.includes(task.task.status)) return [];
  const base = { binding: task.binding, taskId: task.task.id, at };
  return [
    ...state.requests
      .filter((request) => ["pending", "decided"].includes(request.status))
      .map((request): OrchestrationEvent => ({
        type: "request.opened",
        ...base,
        id: facts.nextId(),
        request: { ...request, status: "cancelled" },
      })),
    ...state.activity.flatMap((entry): OrchestrationEvent[] => {
      if (entry.kind === "input" && ["queued", "sending"].includes(entry.status))
        return [
          {
            type: "input.statusChanged",
            ...base,
            id: facts.nextId(),
            entry: { ...entry, ...settledInputStatus(entry, inputCode), updatedAt: at },
          },
        ];
      if (
        (entry.kind === "message" && entry.status === "streaming") ||
        (entry.kind === "tool" && entry.status === "running")
      )
        return [
          {
            type: "input.statusChanged",
            ...base,
            id: facts.nextId(),
            entry: { ...entry, status: "interrupted", updatedAt: at },
          },
        ];
      return [];
    }),
  ];
}
