export type CloudStatus =
  | "queued"
  | "running"
  | "needs_input"
  | "succeeded"
  | "failed"
  | "cancelled";
export type CloudTaskState =
  | "open"
  | "in_progress"
  | "waiting_input"
  | "review"
  | "completed"
  | "cancelled";
export interface SourceView {
  id: string;
  title: string;
  url: string;
  excerpt: string;
}
export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  streaming?: boolean;
}
export interface CloudToolView {
  id: string;
  name: string;
  status: "running" | "succeeded" | "failed" | "cancelled";
  summary?: string;
  input?: unknown;
  output?: unknown;
}
export interface ToolDetail {
  input: unknown;
  output: unknown;
}
export interface AgentUiCapabilities {
  loadToolDetail?: (callId: string) => Promise<ToolDetail>;
  downloadArtifact?: (artifactId: string) => Promise<void>;
  openFile?: (fileRef: { assetVersionId: string; name: string }) => Promise<void>;
}
export type CloudTimelineItem =
  | { id: string; kind: "tool"; tool: CloudToolView }
  | { id: string; kind: "execution"; role: string; status: CloudStatus }
  | { id: string; kind: "status"; status: CloudStatus };

export function isCloudRunTerminal(status: CloudStatus): boolean {
  return ["needs_input", "succeeded", "failed", "cancelled"].includes(status);
}
export function safeSourceUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
