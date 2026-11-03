import { decodeCodexActivity } from "./activity.js";
import { taskText } from "@raypx/core/task-text";
import type { AgentTask, ProviderDefinition } from "@raypx/core/tasks";
import {
  object,
  type AdapterPorts,
  type ProcessSessionStart,
  type ProviderSession,
  type ExecutionHandle,
  type AgentTransport,
  type TransportFactory,
} from "@raypx/provider-core";

const text = (value: unknown, max = 128_000) =>
  typeof value === "string" ? taskText(value, max) : "";
export const codexDefinition = {
  version: 1,
  runtime: "process",
  modes: ["plan", "run"],
  approvals: true,
  modelSelection: false,
} satisfies ProviderDefinition;

/** Private app-server protocol. Task/approval policy belongs to ManagedExecution. */
export class CodexAdapter implements ProviderSession {
  readonly input = "steer" as const;
  readonly holdPlanOnExit = false;
  readonly planContinuation = "turn" as const;
  readonly planTitle = "Codex";
  readonly transport: AgentTransport;
  readonly handle: ExecutionHandle;
  private readonly directory: string;
  private readonly items = new Map<string, Record<string, unknown>>();
  private currentTurnId = "";
  summary = "";
  preview = "";
  constructor(
    start: ProcessSessionStart,
    private readonly ports: AdapterPorts,
    transportFactory: TransportFactory,
  ) {
    this.directory = start.directory;
    const pending: Record<string, unknown>[] = [];
    let ready = false;
    this.transport = transportFactory(
      start.executable,
      ["app-server", "--listen", "stdio://"],
      start.directory,
      (message) => (ready ? this.message(message) : pending.push(message)),
      start.environment,
    );
    this.handle = {
      completed: this.transport.completed.then(() => {}),
      kill: () => this.transport.kill(),
    };
    ready = true;
    queueMicrotask(() => {
      for (const message of pending) this.message(message);
      pending.length = 0;
    });
  }
  private message(message: Record<string, unknown>) {
    if (!this.ports.current(this.handle)) return;
    const method = text(message.method),
      params = object(message.params);
    for (const event of decodeCodexActivity(method, params))
      this.ports.emit({ type: "activity", handle: this.handle, event });
    if (method === "turn/started") this.currentTurnId = text(object(params.turn).id, 500);
    if (method === "item/started") {
      const item = object(params.item);
      this.items.set(text(item.id, 500), item);
      if (item.type === "agentMessage") {
        this.summary = "";
        this.preview = "";
      }
    } else if (method === "item/completed" && object(params.item).type === "agentMessage") {
      this.summary = text(object(params.item).text, 32_000);
      this.preview = text(object(params.item).text, 128_001);
    } else if (message.id !== undefined && method.includes("requestApproval")) {
      const item = this.items.get(text(params.itemId, 500)) ?? object(params.item);
      void this.ports.approval
        .ask(
          "permission",
          text(params.reason, 500) || "Codex",
          JSON.stringify(
            {
              command: params.command,
              changes: params.changes ?? item.changes,
              permissions: params.permissions,
            },
            null,
            2,
          ),
        )
        .then((decision) => {
          if (!this.ports.current(this.handle)) return;
          this.transport.send({
            id: message.id,
            result:
              method === "item/permissions/requestApproval"
                ? {
                    permissions: decision.type === "allow" ? params.permissions : {},
                    scope: "turn",
                  }
                : { decision: decision.type === "allow" ? "accept" : "decline" },
          });
        })
        .catch(() => {
          if (this.ports.current(this.handle))
            this.ports.emit({ type: "failed", handle: this.handle });
        });
    } else if (message.id !== undefined && method === "item/tool/requestUserInput") {
      const questions = Array.isArray(params.questions)
        ? params.questions.map((q: unknown) => {
            const question = object(q);
            return {
              id: text(question.id, 300),
              text: text(question.question, 8000),
              multiSelect: false,
              options: Array.isArray(question.options)
                ? question.options.map((o: unknown) => ({
                    label: text(object(o).label, 1000),
                    description: text(object(o).description, 8000),
                  }))
                : [],
            };
          })
        : [];
      void this.ports.approval
        .ask(
          "question",
          "Codex",
          "",
          questions,
          typeof params.autoResolutionMs === "number"
            ? Date.now() + params.autoResolutionMs
            : undefined,
        )
        .then((decision) => {
          if (!this.ports.current(this.handle)) return;
          this.transport.send({
            id: message.id,
            result: {
              answers:
                decision.type === "answer"
                  ? Object.fromEntries(
                      Object.entries(decision.answers).map(([key, answers]) => [key, { answers }]),
                    )
                  : {},
            },
          });
        })
        .catch(() => {
          if (this.ports.current(this.handle))
            this.ports.emit({ type: "failed", handle: this.handle });
        });
    } else if (message.id !== undefined && method)
      this.transport.send({
        id: message.id,
        error: { code: -32601, message: "Unsupported host request" },
      });
    else if (method === "item/agentMessage/delta") {
      this.summary = taskText(this.summary + text(params.delta, 32_000), 32_000, true);
      this.preview = taskText(this.preview + text(params.delta, 128_001), 128_001);
    } else if (method === "turn/completed") {
      const turn = object(params.turn);
      const status =
        turn.status === "completed"
          ? "completed"
          : turn.status === "interrupted"
            ? "interrupted"
            : "failed";
      this.ports.emit({
        type: "completed",
        handle: this.handle,
        status,
        summary: this.summary,
        preview: this.preview,
        ...(text(turn.id, 500) ? { turnId: text(turn.id, 500) } : {}),
      });
    }
  }
  get turnId() {
    return this.currentTurnId;
  }
  async initialize(mode: AgentTask["mode"], sessionId?: string) {
    await this.transport.request("initialize", {
      clientInfo: { name: "raypx", title: "Raypx", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    this.transport.send({ method: "initialized", params: {} });
    const response = await this.transport.request(sessionId ? "thread/resume" : "thread/start", {
      ...(sessionId ? { threadId: sessionId } : {}),
      cwd: this.directory,
      approvalPolicy: "on-request",
      sandbox: mode === "plan" ? "read-only" : "workspace-write",
    });
    return text(object(response.thread).id, 500);
  }
  async sendTurn(prompt: string, sessionId: string | null, mode: AgentTask["mode"]) {
    this.currentTurnId = "";
    this.summary = "";
    this.preview = "";
    this.items.clear();
    const response = await this.transport.request("turn/start", {
      threadId: sessionId,
      input: [{ type: "text", text: prompt }],
      sandboxPolicy:
        mode === "plan"
          ? { type: "readOnly" }
          : { type: "workspaceWrite", writableRoots: [this.directory], networkAccess: false },
    });
    this.currentTurnId = text(object(response.turn).id, 500) || this.currentTurnId;
    this.ports.emit({ type: "turn-id", handle: this.handle, id: this.currentTurnId });
  }
  async interrupt(sessionId?: string | null) {
    await this.transport.request("turn/interrupt", {
      threadId: sessionId ?? null,
      turnId: this.currentTurnId,
    });
  }
  async steer(prompt: string, sessionId: string | null) {
    await this.transport.request("turn/steer", {
      threadId: sessionId,
      expectedTurnId: this.currentTurnId,
      input: [{ type: "text", text: prompt }],
    });
  }
}

export { decodeCodexActivity } from "./activity.js";
