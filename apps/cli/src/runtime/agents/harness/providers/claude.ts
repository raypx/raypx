import type { AgentTask } from "@raypx/core/tasks";
import { createProcess, type ProcessFactory, type ProviderProcess } from "./process";

interface ClaudeObserver {
  current(): boolean;
  record(message: Record<string, unknown>): void;
  session(id: string): void;
  completed(message: Record<string, unknown>): void;
}
/** Private stream-json protocol; the coordinator decides what a result means. */
export class ClaudeProvider {
  readonly process: ProviderProcess;
  constructor(
    executable: string,
    directory: string,
    options: {
      mode: AgentTask["mode"];
      sessionId?: string;
      hookUrl: string;
      hookToken: string;
      environment?: Record<string, string | undefined>;
    },
    observer: ClaudeObserver,
    processFactory: ProcessFactory = createProcess,
  ) {
    const hook = {
      type: "http",
      url: options.hookUrl,
      headers: { Authorization: "Bearer $RAYPX_AGENT_HOOK_TOKEN" },
      allowedEnvVars: ["RAYPX_AGENT_HOOK_TOKEN"],
      timeout: 610,
      onFailure: "block",
    };
    const settings = {
      hooks: {
        PermissionRequest: [{ matcher: ".*", hooks: [hook] }],
        PreToolUse: [{ matcher: "AskUserQuestion|ExitPlanMode", hooks: [hook] }],
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
      options.mode === "plan" ? "plan" : "manual",
      "--settings",
      JSON.stringify(settings),
    ];
    if (options.sessionId) args.push("--resume", options.sessionId);
    this.process = processFactory(
      executable,
      args,
      directory,
      (message) => {
        if (!observer.current()) return;
        observer.record(message);
        if (message.type === "system" && typeof message.session_id === "string")
          observer.session(message.session_id);
        if (message.type === "result") observer.completed(message);
      },
      { ...(options.environment ?? process.env), RAYPX_AGENT_HOOK_TOKEN: options.hookToken },
    );
  }
  async sendTurn(prompt: string, sessionId: string | null) {
    // Prompt text is written on stdin rather than exposed in process arguments.
    this.process.send({
      type: "user",
      uuid: crypto.randomUUID(),
      ...(sessionId ? { session_id: sessionId } : {}),
      message: { role: "user", content: prompt },
      parent_tool_use_id: null,
      client_composed: true,
    });
  }
  interrupt() {
    return this.process.control({ subtype: "interrupt" });
  }
}
