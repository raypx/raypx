import type { AgentTask, ProviderDefinition } from "@raypx/core/tasks";
import { taskText } from "@raypx/core/task-text";
import type {
  AdapterPorts,
  ExecutionHandle,
  ProviderSession,
  ConversationEvent,
} from "../core/index.ts";
import { PiRunner, type PiRunnerOptions } from "./runner.ts";

export const piDefinition = {
  version: 1,
  runtime: "sdk",
  modes: ["plan", "run"],
  approvals: true,
  modelSelection: true,
} satisfies ProviderDefinition;

export interface PiSessionOptions extends Omit<PiRunnerOptions, "tools" | "onActivity"> {
  sessionId: string;
  tools(mode: AgentTask["mode"]): PiRunnerOptions["tools"];
  close(): void;
}

/** The host owns the lifetime; a completed turn leaves the session available for queued work. */
export class PiAdapter implements ProviderSession {
  readonly input = "queue" as const;
  readonly holdPlanOnExit = false;
  readonly planContinuation = "turn" as const;
  readonly planTitle = "Pi";
  readonly turnId = undefined;
  readonly handle: ExecutionHandle;
  preview = "";
  summary = "";
  private stopped = false;
  private runner: PiRunner | undefined;
  private pending: Promise<void> | undefined;
  constructor(
    private readonly options: PiSessionOptions,
    private readonly ports: AdapterPorts,
  ) {
    let drained!: () => void;
    const completed = new Promise<void>((resolve) => {
      drained = resolve;
    });
    let closing: Promise<void> | undefined;
    this.handle = {
      completed,
      kill: () =>
        (closing ??= (async () => {
          this.stopped = true;
          await this.runner?.cancel();
          await this.pending;
          this.options.close();
          drained();
        })()),
    };
  }
  async initialize(_mode: AgentTask["mode"], sessionId?: string) {
    if (sessionId && sessionId !== this.options.sessionId) throw new Error("SESSION_UNAVAILABLE");
    return this.options.sessionId;
  }
  async sendTurn(prompt: string, _sessionId: string | null, mode: AgentTask["mode"]) {
    if (this.stopped || this.pending) throw new Error("PI_BUSY");
    this.summary = "";
    this.preview = "";
    const activity = (event: ConversationEvent) => {
      if (!this.ports.current(this.handle)) return;
      this.ports.emit({ type: "activity", handle: this.handle, event });
    };
    this.runner = new PiRunner({
      ...this.options,
      tools: this.options.tools(mode),
      onActivity: activity,
    });
    const pending = this.runner
      .run(prompt, { timeoutMs: 600_000 })
      .then((result) => {
        if (this.pending === pending) this.pending = undefined;
        this.summary = taskText(result.text || result.code || "", 32_000);
        this.preview = taskText(result.text, 128_001);
        if (!this.stopped && this.ports.current(this.handle))
          this.ports.emit({
            type: "completed",
            handle: this.handle,
            status:
              result.status === "succeeded"
                ? "completed"
                : result.status === "cancelled"
                  ? "interrupted"
                  : "failed",
            summary: this.summary,
            preview: this.preview,
          });
      })
      .finally(() => {
        if (this.pending === pending) this.pending = undefined;
      });
    this.pending = pending;
  }
  async steer(_prompt: string, _sessionId: string | null): Promise<void> {
    throw new Error("UNSUPPORTED_CAPABILITY");
  }
  async interrupt(_sessionId?: string | null): Promise<void> {
    throw new Error("UNSUPPORTED_CAPABILITY");
  }
}
