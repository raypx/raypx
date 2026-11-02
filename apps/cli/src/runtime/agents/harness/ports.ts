import type { AgentTask, HumanRequest, TaskActivity } from "@raypx/core/tasks";
import type { ConversationEvent, TokenTotals } from "@raypx/provider-core";
import type { ActivityDraft, LocalAgentTask } from "../model";

/** Borrow synchronous persistence without depending on SQLite or owning its lifetime. */
export interface ExecutionStore {
  get(id: string): LocalAgentTask | undefined;
  /** Returning undefined prevents an async writer from satisfying this port. */
  put(value: LocalAgentTask): undefined;
  recordActivity(binding: string, draft: ActivityDraft): TaskActivity;
  request(binding: string, value: HumanRequest): undefined;
  getRequest(binding: string, id: string): HumanRequest | undefined;
  tokenUsage(sessionId: string): TokenTotals | undefined;
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
  hook(): { url: string; token: string };
  /** Adapter transports inherit this, including the bundled Bun PATH entry. */
  environment(): Record<string, string | undefined>;
  track(completion: Promise<void>): void;
  ended(): void;
}
