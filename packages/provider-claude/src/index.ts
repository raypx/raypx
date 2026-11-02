import type { AgentTask } from "@raypx/core/tasks";
import { taskText } from "@raypx/core/task-text";
import {
  type AdapterPorts,
  type AdapterStart,
  type AgentAdapter,
  type ExecutionHandle,
  type AgentTransport,
  type TransportFactory,
} from "@raypx/provider-core";

/** Private stream-json protocol; the coordinator decides what a result means. */
export class ClaudeAdapter implements AgentAdapter {
  readonly input = "interrupt" as const;
  readonly holdPlanOnExit = true;
  readonly planContinuation = "process" as const;
  readonly planTitle = "Claude Code";
  readonly turnId = undefined;
  readonly preview = "";
  readonly summary = "";
  readonly transport: AgentTransport;
  readonly handle: ExecutionHandle;
  constructor(
    start: AdapterStart,
    private readonly ports: AdapterPorts,
    transportFactory: TransportFactory,
  ) {
    const hook = ports.approval.hook();
    const hookConfiguration = {
      type: "http",
      url: hook.url,
      headers: { Authorization: "Bearer $RAYPX_AGENT_HOOK_TOKEN" },
      allowedEnvVars: ["RAYPX_AGENT_HOOK_TOKEN"],
      timeout: 610,
      onFailure: "block",
    };
    const settings = {
      hooks: {
        PermissionRequest: [{ matcher: ".*", hooks: [hookConfiguration] }],
        PreToolUse: [{ matcher: "AskUserQuestion|ExitPlanMode", hooks: [hookConfiguration] }],
      },
    };
    const args = [
      "-p",
      "--input-format",
      "stream-json",
      "--output-format",
      "stream-json",
      "--include-partial-messages",
      "--replay-user-messages",
      "--verbose",
      "--permission-mode",
      start.mode === "plan" ? "plan" : "manual",
      "--settings",
      JSON.stringify(settings),
    ];
    if (start.sessionId) args.push("--resume", start.sessionId);
    const pending: Record<string, unknown>[] = [];
    let ready = false;
    this.transport = transportFactory(
      start.executable,
      args,
      start.directory,
      (message) => (ready ? this.message(message) : pending.push(message)),
      { ...start.environment, RAYPX_AGENT_HOOK_TOKEN: hook.token },
    );
    this.handle = { completed: this.transport.completed, kill: () => this.transport.kill() };
    ready = true;
    queueMicrotask(() => {
      for (const message of pending) this.message(message);
      pending.length = 0;
    });
  }
  private message(message: Record<string, unknown>) {
    if (!this.ports.current(this.handle)) return;
    this.ports.emit({ type: "record", handle: this.handle, message });
    if (message.type === "system" && typeof message.session_id === "string")
      this.ports.emit({ type: "session", handle: this.handle, id: message.session_id });
    if (message.type === "result") {
      const result = typeof message.result === "string" ? message.result : "";
      this.ports.emit({
        type: "completed",
        handle: this.handle,
        status: message.is_error === true ? "failed" : "completed",
        summary: taskText(result, 32_000),
        preview: taskText(result, 128_001),
      });
    }
  }
  async sendTurn(prompt: string, sessionId: string | null, _mode: AgentTask["mode"]) {
    // Prompt text is written on stdin rather than exposed in process arguments.
    this.transport.send({
      type: "user",
      uuid: crypto.randomUUID(),
      ...(sessionId ? { session_id: sessionId } : {}),
      message: { role: "user", content: prompt },
      parent_tool_use_id: null,
      client_composed: true,
    });
  }
  async initialize(_mode: AgentTask["mode"], _sessionId?: string) {
    return undefined;
  }
  async steer(_prompt: string, _sessionId: string | null) {
    throw new Error("Use interrupt before the next Claude turn");
  }
  async interrupt(_sessionId?: string | null) {
    await this.transport.control({ subtype: "interrupt" });
  }
}

export { respondToClaudeHook, type ClaudeHookApprovalPort } from "./hooks";
