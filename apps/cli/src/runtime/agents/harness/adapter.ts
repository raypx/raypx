import type { AgentTask } from "@raypx/core/tasks";
import type { AskApproval, TransportFactory } from "./transport";

/** A process lifetime that the execution coordinator can observe and stop. */
export interface ExecutionHandle {
  readonly completed: Promise<number>;
  kill(): Promise<void>;
}

/** Provider-neutral capabilities exposed by every agent adapter. */
export interface ExecutionDriver {
  readonly handle: ExecutionHandle;
  readonly input: "steer" | "interrupt";
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

/** A concrete adapter exposes the driver consumed by ManagedExecution. */
export type AgentAdapter = ExecutionDriver;

export interface AdapterStart {
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
  | { type: "record"; handle: ExecutionHandle; message: Record<string, unknown> }
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

export type AgentAdapterFactory = (
  start: AdapterStart,
  ports: AdapterPorts,
  transportFactory: TransportFactory,
) => AgentAdapter;

export type { AgentTransport, AskApproval, TransportFactory } from "./transport";
