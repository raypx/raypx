import type { AgentTask } from "@raypx/core/tasks";
import type { AskApproval, TransportFactory } from "./transport.ts";

/** A session lifetime, including SDK streams, that must drain before releasing ownership. */
export interface ExecutionHandle {
  readonly completed: Promise<void>;
  kill(): Promise<void>;
}

/** Provider-neutral capabilities exposed by every agent adapter. */
export interface ProviderSession {
  readonly handle: ExecutionHandle;
  readonly input: "steer" | "interrupt" | "queue";
  readonly holdPlanOnExit: boolean;
  readonly planContinuation: "turn" | "process";
  readonly planTitle: string;
  readonly turnId: string | undefined;
  readonly preview: string;
  readonly summary: string;
  initialize(mode: AgentTask["mode"], sessionId?: string): Promise<string | undefined>;
  sendTurn(prompt: string, sessionId: string | null, mode: AgentTask["mode"]): Promise<void>;
  steer(prompt: string, sessionId: string | null): Promise<void>;
  interrupt(sessionId?: string | null): Promise<void>;
}

export interface ProcessSessionStart {
  executable: string;
  directory: string;
  mode: AgentTask["mode"];
  environment: Record<string, string | undefined>;
  sessionId?: string;
}

export interface AdapterPorts {
  approval: { ask: AskApproval; hook(): { url: string; token: string } };
  current(handle: ExecutionHandle): boolean;
  emit(event: AdapterEvent): void;
}

export type AdapterEvent =
  | {
      type: "activity";
      handle: ExecutionHandle;
      event: import("./conversation.ts").ConversationEvent;
    }
  | { type: "session"; handle: ExecutionHandle; id: string }
  | { type: "turn-id"; handle: ExecutionHandle; id: string }
  | {
      type: "completed";
      handle: ExecutionHandle;
      status: "completed" | "interrupted" | "failed";
      summary: string;
      preview: string;
      turnId?: string;
    }
  | { type: "failed"; handle: ExecutionHandle };

export type ProcessAdapterFactory = (
  start: ProcessSessionStart,
  ports: AdapterPorts,
  transportFactory: TransportFactory,
) => ProviderSession;

export type { AgentTransport, TransportFactory, AskApproval } from "./transport.ts";
export { object } from "./transport.ts";

export type { ConversationEvent, ConversationEntry, TokenTotals } from "./conversation.ts";

export interface SessionStart {
  directory: string;
  mode: AgentTask["mode"];
  environment: Record<string, string | undefined>;
  sessionId?: string;
}
export type SessionFactory = (start: SessionStart, ports: AdapterPorts) => ProviderSession;
