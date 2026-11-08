import type { z } from "zod";
import type {
  AgentEvent,
  HumanDecision,
  HumanRequest,
  TaskActivity,
  taskInputSchema,
} from "@raypx/core/tasks";
import type { ActivityDraft, LocalAgentTask, TokenUsage } from "./state.ts";

/**
 * Inputs the host submits to the decider. Relay, local and device entry points
 * converge on the same commands; effect results arrive as commands too, so the
 * next decision is the only place state changes.
 */
export type OrchestrationCommand =
  | { type: "task.accept"; binding: string; receiptId: string; task: LocalAgentTask }
  | {
      type: "task.transition";
      binding: string;
      task: LocalAgentTask;
      status: Extract<AgentEvent, { kind: "status" }>;
      inputCode: Extract<TaskActivity, { kind: "input" }>["code"];
    }
  | {
      type: "task.session";
      binding: string;
      task: LocalAgentTask;
      sessionId: string | null;
      tokenUsage?: TokenUsage;
    }
  | {
      type: "task.mode";
      binding: string;
      task: LocalAgentTask;
      mode: LocalAgentTask["task"]["mode"];
    }
  | { type: "task.usage"; binding: string; task: LocalAgentTask; totals: TokenUsage }
  | { type: "activity.record"; binding: string; draft: ActivityDraft }
  | { type: "request.record"; binding: string; request: HumanRequest };

/** The start, cancel and decision commands the worker receives. */
export type EffectCommand =
  | {
      type: "start";
      binding: string;
      commandId: string;
      task: LocalAgentTask["task"];
      deadline: string;
    }
  | { type: "cancel"; binding: string; commandId: string; taskId: string }
  | {
      type: "decision";
      binding: string;
      commandId: string;
      taskId: string;
      requestId: string;
      decision: HumanDecision;
      /**
       * Relay and local commands record the accepted answer as `decided` before
       * it is applied, so the journal shows both states; device commands apply
       * directly.
       */
      recordDecided?: boolean;
    }
  | {
      type: "input";
      binding: string;
      commandId: string;
      input: z.infer<typeof taskInputSchema>;
    };

/** Facts the decider may not read itself: live process state of this host. */
export interface LiveFacts {
  closing: boolean;
  /** The task has an active execution handle. */
  active(taskId: string): boolean;
  /** The handle still holds this approval request. */
  pending(taskId: string, requestId: string): boolean;
  /** A steer or queued input may be delivered to this task now. */
  ready(taskId: string): boolean;
  queueLength(taskId: string): number;
}

/**
 * Effects the worker runs after the commit that produced them. They are
 * process-bound and never retried: the provider process they address is gone
 * after a restart.
 */
export type Effect =
  | {
      type: "execution.start";
      binding: string;
      commandId: string;
      taskId: string;
      deadline: string;
    }
  | {
      type: "execution.cancel";
      binding: string;
      commandId: string;
      taskId: string;
    }
  | {
      type: "provider.request.respond";
      binding: string;
      commandId: string;
      taskId: string;
      requestId: string;
      decision: HumanDecision;
    }
  | {
      type: "provider.input.deliver";
      binding: string;
      commandId: string;
      taskId: string;
      inputId: string;
    };
