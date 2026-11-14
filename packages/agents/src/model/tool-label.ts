import type { ComputerToolName } from "@raypx/core/approvals";

/** One catalog shared by the DOM and native renderers. Remote names stay open. */
export const toolLabelKeys = {
  computer_list_files: "tools.listFiles",
  computer_read_file: "tools.readFile",
  computer_write_file: "tools.writeFile",
  computer_run_command: "tools.runCommand",
  computer_screenshot: "tools.screenshot",
  computer_pointer: "tools.pointer",
  computer_keyboard: "tools.keyboard",
  agent_memory_save: "tools.saveMemory",
  agent_memory_update: "tools.updateMemory",
  agent_page_create: "tools.createPage",
  agent_page_update: "tools.updatePage",
  agent_page_read: "tools.readPage",
  agent_skill_load: "tools.loadSkill",
  agent_skill_save: "tools.saveSkill",
  agent_send_message: "tools.messageAgent",
  agent_delegate: "tools.delegateTask",
  agent_wait: "tools.waitForChildren",
} as const satisfies Record<
  ComputerToolName | "agent_send_message" | "agent_delegate" | "agent_wait",
  `tools.${string}`
>;
export type ToolLabelKey = (typeof toolLabelKeys)[keyof typeof toolLabelKeys];

/** Returns a built-in catalog key (or its translation), otherwise bounded plain text. */
export function toolDisplayLabel(
  name: string,
  translate: (key: ToolLabelKey) => string = (key) => key,
): string {
  if (Object.hasOwn(toolLabelKeys, name))
    return translate(toolLabelKeys[name as keyof typeof toolLabelKeys]);
  const bounded = name.slice(0, 512);
  const remote = /^(mcp|openapi)_([a-zA-Z0-9_-]+?)__([a-zA-Z0-9_-]+)$/.exec(bounded);
  if (remote)
    return `${remote[1] === "openapi" ? "API" : "MCP"} ${remote[2]!.slice(0, 32)} / ${remote[3]!.replaceAll("_", " ").slice(0, 80)}`;
  return (
    bounded
      .replace(/[^a-zA-Z0-9_.: -]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 128) || "Tool"
  );
}

/** Server summaries carry readable OpenAPI labels; exact names remain the policy identity. */
export function toolOperationLabel(
  call: { toolName: string; argumentSummary: string },
  translate: (key: ToolLabelKey) => string = (key) => key,
): string {
  if (call.toolName.startsWith("openapi_")) {
    const match = /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS|TRACE) (.+)$/u.exec(
      call.argumentSummary,
    );
    if (match) {
      const label = match[2]!
        .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, " ")
        .trim()
        .slice(0, 160);
      if (label) return label;
    }
  }
  return toolDisplayLabel(call.toolName, translate);
}

/** This describes the registered HTTP method, never a claim about authorization. */
export function openApiOperationKind(call: {
  toolName: string;
  target: string;
}): "readOnly" | "mutating" | null {
  if (!call.toolName.startsWith("openapi_")) return null;
  const method = /^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS|TRACE) /u.exec(call.target)?.[1];
  if (!method) return null;
  return method === "GET" || method === "HEAD" ? "readOnly" : "mutating";
}
