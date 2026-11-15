import { agentIdentityIndex } from "@raypx/agents/model";

const identity = [
  "text-identity-1",
  "text-identity-2",
  "text-identity-3",
  "text-identity-4",
  "text-identity-5",
  "text-identity-6",
  "text-identity-7",
  "text-identity-8",
];
const avatars = [
  "bg-identity-1-bg",
  "bg-identity-2-bg",
  "bg-identity-3-bg",
  "bg-identity-4-bg",
  "bg-identity-5-bg",
  "bg-identity-6-bg",
  "bg-identity-7-bg",
  "bg-identity-8-bg",
];
export function agentIdentityClass(id: string): string {
  return identity[agentIdentityIndex(id) - 1]!;
}
export function agentAvatarClass(id: string): string {
  return avatars[agentIdentityIndex(id) - 1]!;
}

export function statusClass(state: string): string {
  switch (state) {
    case "running":
    case "starting":
    case "queued":
      return "self-start rounded-md border border-info-border bg-info-bg px-2 py-1 text-info-text";
    case "waiting":
    case "stopping":
    case "pending":
      return "self-start rounded-md border border-warning-border bg-warning-bg px-2 py-1 text-warning-text";
    case "failed":
    case "refused":
    case "denied":
    case "unknown":
      return "self-start rounded-md border border-danger-border bg-danger-bg px-2 py-1 text-danger-text";
    case "succeeded":
    case "approved":
      return "self-start rounded-md border border-success-border bg-success-bg px-2 py-1 text-success-text";
    default:
      return "self-start rounded-md border border-border bg-surface-sunken px-2 py-1 text-muted-foreground";
  }
}
