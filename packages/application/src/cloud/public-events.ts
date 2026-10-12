import type { CloudRunEvent } from "@voidmix/core";
/** Tool bodies stay in the detail endpoint; replay and SSE carry the same bounded summary. */
export function publicCloudEvent(event: CloudRunEvent): CloudRunEvent {
  if (event.type !== "tool.started" && event.type !== "tool.completed") return event;
  const payload = event.payload;
  const value = event.type === "tool.started" ? payload["input"] : payload["output"];
  const summary =
    typeof payload["summary"] === "string"
      ? payload["summary"]
      : typeof value === "string"
        ? value
        : JSON.stringify(value ?? null);
  return {
    ...event,
    payload: {
      callId: payload["callId"],
      name: payload["name"],
      status:
        event.type === "tool.started" ? "running" : payload["isError"] ? "failed" : "succeeded",
      isError: payload["isError"] === true,
      summary: summary.slice(0, 300),
    },
  };
}
