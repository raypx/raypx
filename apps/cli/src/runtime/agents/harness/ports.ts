import type { AgentTask, HumanRequest, TaskActivity } from "@raypx/core/tasks";
import type { ConversationEvent, TokenTotals } from "@raypx/providers/core";
import type { ActivityDraft, LocalAgentTask } from "../model.ts";

/**
 * Synchronous command submission for the turn and approval state machine. Each
 * method commits through the orchestration sink; `undefined` returns prevent an
 * async writer from satisfying this port.
 */
export interface ExecutionStore {
  get(id: string): LocalAgentTask | undefined;
  /** Session binding for the task, or a mode change, as a committed command. */
  put(value: LocalAgentTask): undefined;
  recordActivity(binding: string, draft: ActivityDraft): TaskActivity;
  request(binding: string, value: HumanRequest): undefined;
  getRequest(binding: string, id: string): HumanRequest | undefined;
  tokenUsage(sessionId: string): TokenTotals | undefined;
}

/**
 * Provider reports the harness forwards for a current handle. The application
 * ingestor commits them; the harness never writes storage for provider events.
 */
export interface ExecutionIngest {
  session(sessionId: string): void;
}

/** Recording policy stays outside the turn and approval state machine. */
export interface ExecutionConversation {
  record(event: ConversationEvent): void;
  setTokenBaseline(value: TokenTotals | undefined): void;
  setTurnId(value: string): void;
  startTurn(): void;
  endTurn(status: "complete" | "interrupted"): void;
  stop(status: "complete" | "interrupted"): void;
}

export interface ExecutionEffects {
  status(status: AgentTask["status"], summary?: string): void;
  changed(pendingRequest?: string): void;
  resolved(requestId: string): void;
  hook(): { url: string; token: string } | Promise<{ url: string; token: string }>;
  /** Adapter transports inherit user tools and the bundled Node PATH entry. */
  environment(): Record<string, string | undefined>;
  track(completion: Promise<void>): void;
  ended(): void;
}
