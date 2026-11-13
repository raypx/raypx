import type { ComputerToolName } from "@raypx/core/approvals";

/** One catalog shared by the DOM and native renderers. Remote names stay open. */
export const toolLabelKeys = {
  computer_list_files: "tools.listFiles",
  computer_read_file: "tools.readFile",
  computer_write_file: "tools.writeFile",
  computer_run_command: "tools.runCommand",
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
  const remote = /^mcp_([a-zA-Z0-9_-]+?)__([a-zA-Z0-9_-]+)$/.exec(bounded);
  if (remote)
    return `MCP ${remote[1]!.slice(0, 32)} / ${remote[2]!.replaceAll("_", " ").slice(0, 80)}`;
  return (
    bounded
      .replace(/[^a-zA-Z0-9_.: -]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 128) || "Tool"
  );
}
