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
