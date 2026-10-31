import { taskText } from "@raypx/core/task-text";
import { type AgentTask } from "@raypx/core/tasks";
import {
  createProcess,
  object,
  type AskApproval,
  type ProcessFactory,
  type ProviderProcess,
} from "./process";

const text = (value: unknown, max = 128_000) =>
  typeof value === "string" ? taskText(value, max) : "";
interface CodexObserver {
  current(): boolean;
  record(method: string, params: Record<string, unknown>): void;
  ask: AskApproval;
  completed(status: unknown, turnId?: string): void;
  failed(): void;
  turnId(id: string): void;
}
/** Private app-server protocol. Task/approval policy belongs to ManagedExecution. */
export class CodexProvider {
  readonly process: ProviderProcess;
  private readonly items = new Map<string, Record<string, unknown>>();
  private currentTurnId = "";
  summary = "";
  preview = "";
  constructor(
    executable: string,
    private readonly directory: string,
    private readonly observer: CodexObserver,
    processFactory: ProcessFactory = createProcess,
  ) {
    this.process = processFactory(
      executable,
      ["app-server", "--listen", "stdio://"],
      directory,
      (message) => this.message(message),
    );
  }
  private message(message: Record<string, unknown>) {
    if (!this.observer.current()) return;
    const method = text(message.method),
      params = object(message.params);
    this.observer.record(method, params);
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
      void this.observer
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
          if (!this.observer.current()) return;
          this.process.send({
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
          if (this.observer.current()) this.observer.failed();
        });
    } else if (
      message.id !== undefined &&
      (method === "item/tool/requestUserInput" || method === "tool/requestUserInput")
    ) {
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
      void this.observer
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
          if (!this.observer.current()) return;
          this.process.send({
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
          if (this.observer.current()) this.observer.failed();
        });
    } else if (message.id !== undefined && method)
      this.process.send({
        id: message.id,
        error: { code: -32601, message: "Unsupported host request" },
      });
    else if (method === "item/agentMessage/delta") {
      this.summary = taskText(this.summary + text(params.delta, 32_000), 32_000, true);
      this.preview = taskText(this.preview + text(params.delta, 128_001), 128_001);
    } else if (method === "turn/completed") {
      const turn = object(params.turn);
      this.observer.completed(turn.status, text(turn.id, 500) || undefined);
    }
  }
  get turnId() {
    return this.currentTurnId;
  }
  async initialize(mode: AgentTask["mode"], sessionId?: string) {
    await this.process.request("initialize", {
      clientInfo: { name: "raypx", title: "Raypx", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    });
    this.process.send({ method: "initialized", params: {} });
    const response = await this.process.request(sessionId ? "thread/resume" : "thread/start", {
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
    const response = await this.process.request("turn/start", {
      threadId: sessionId,
      input: [{ type: "text", text: prompt }],
      sandboxPolicy:
        mode === "plan"
          ? { type: "readOnly" }
          : { type: "workspaceWrite", writableRoots: [this.directory], networkAccess: false },
    });
    this.currentTurnId = text(object(response.turn).id, 500) || this.currentTurnId;
    this.observer.turnId(this.currentTurnId);
  }
  interrupt(sessionId: string | null) {
    return this.process.request("turn/interrupt", {
      threadId: sessionId,
      turnId: this.currentTurnId,
    });
  }
  steer(prompt: string, sessionId: string | null) {
    return this.process.request("turn/steer", {
      threadId: sessionId,
      expectedTurnId: this.currentTurnId,
      input: [{ type: "text", text: prompt }],
    });
  }
}
