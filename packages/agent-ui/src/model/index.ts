import type { AgentRunDto, RunEventDto, RunArtifactDto } from "@voidmix/contracts";

export type RunStatus = AgentRunDto["status"];
export type { AgentRunDto, RunEventDto, RunArtifactDto };
export type ToolView = {
  id: string;
  name: string;
  input: unknown;
  output?: unknown;
  status: "running" | "succeeded" | "failed";
};
export type ApprovalView = { id: string; prompt: string; decision?: "approve" | "deny" };
export type TimelineItem =
  | { id: string; kind: "message"; text: string; roleId: string }
  | { id: string; kind: "tool"; tool: ToolView }
  | { id: string; kind: "approval"; approval: ApprovalView }
  | { id: string; kind: "status"; status: RunStatus; error?: string }
  | { id: string; kind: "artifact"; name: string; assetVersionId: string };

/** Replay and live data share one ordered projection; duplicate delivery is harmless. */
export function projectRunEvents(events: readonly RunEventDto[]): TimelineItem[] {
  const items: TimelineItem[] = [];
  const tools = new Map<string, ToolView>();
  const messages = new Map<string, Extract<TimelineItem, { kind: "message" }>>();
  const approvals = new Map<string, ApprovalView>();
  const seen = new Set<string>();
  for (const event of [...events].sort((a, b) => a.seq - b.seq)) {
    const id = `${event.runId}:${event.seq}`;
    if (seen.has(id)) continue;
    seen.add(id);
    switch (event.type) {
      case "message.delta":
      case "message.completed": {
        const roleId = event.payload.roleId ?? "assistant";
        const key = `${event.runId}:${event.payload.messageId}`;
        let message = messages.get(key);
        if (!message) {
          message = { id: key, kind: "message", text: "", roleId };
          messages.set(key, message);
          items.push(message);
        }
        if (event.type === "message.completed") message.text = event.payload.text;
        else message.text += event.payload.text;
        break;
      }
      case "tool.started": {
        const tool: ToolView = {
          id: event.payload.callId,
          name: event.payload.name,
          input: event.payload.input,
          status: "running",
        };
        tools.set(tool.id, tool);
        items.push({ id, kind: "tool", tool });
        break;
      }
      case "tool.completed": {
        let tool = tools.get(event.payload.callId);
        if (!tool) {
          tool = {
            id: event.payload.callId,
            name: event.payload.name,
            input: null,
            status: "running",
          };
          tools.set(tool.id, tool);
          items.push({ id, kind: "tool", tool });
        }
        tool.output = event.payload.output;
        tool.status = event.payload.isError ? "failed" : "succeeded";
        break;
      }
      case "approval.requested": {
        const approval: ApprovalView = {
          id: event.payload.approvalId,
          prompt: event.payload.prompt,
        };
        approvals.set(approval.id, approval);
        items.push({ id, kind: "approval", approval });
        break;
      }
      case "approval.resolved": {
        const approval = approvals.get(event.payload.approvalId);
        if (approval) approval.decision = event.payload.decision;
        break;
      }
      case "run.status":
        items.push({
          id,
          kind: "status",
          status: event.payload.status,
          ...(event.payload.error ? { error: event.payload.error } : {}),
        });
        break;
      case "artifact.created":
        items.push({
          id,
          kind: "artifact",
          name: event.payload.name,
          assetVersionId: event.payload.assetVersionId,
        });
        break;
    }
  }
  return items;
}

export function isRunTerminal(status: RunStatus): boolean {
  return status === "succeeded" || status === "failed" || status === "cancelled";
}

export function displayToolValue(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === undefined || value === null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export * from "./cloud";
export { createConversationProjection, createCloudTimelineProjection } from "./cloud-projection";
