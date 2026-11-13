import type { ConversationEvent, ToolActivity } from "@raypx/core/conversation";

export function toolActivityKey(call: Pick<ToolActivity, "runId" | "toolCallId">) {
  return JSON.stringify([call.runId, call.toolCallId]);
}

/** Lifecycle identity survives attempts, resumed Runs and retained event prefixes. */
export function mergeToolActivity(
  previous: readonly ToolActivity[],
  incoming: readonly ToolActivity[],
  limit = 100,
): ToolActivity[] {
  const calls = new Map(previous.map((call) => [toolActivityKey(call), call]));
  for (const call of incoming) {
    const key = toolActivityKey(call);
    const existing = calls.get(key);
    // A delayed/replayed start can never replace a recorded terminal outcome.
    if (existing?.finishedAt && !call.finishedAt) continue;
    calls.set(key, call);
  }
  return [...calls.values()]
    .sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt))
    .slice(-limit);
}

export function applyToolActivityEvent(
  previous: readonly ToolActivity[],
  event: ConversationEvent,
): ToolActivity[] {
  if (event.kind !== "tool.started" && event.kind !== "tool.finished") return [...previous];
  const existing = previous.find((call) => toolActivityKey(call) === toolActivityKey(event));
  const finished = event.kind === "tool.finished";
  const call: ToolActivity = {
    runId: event.runId,
    agentId: event.agentId ?? existing?.agentId,
    parentRunId: event.parentRunId ?? existing?.parentRunId,
    toolCallId: event.toolCallId,
    toolName: event.toolName,
    target: event.target.slice(0, 1_024),
    argumentSummary: event.argumentSummary.slice(0, 1_024),
    startedAt: existing?.startedAt ?? event.createdAt,
    finishedAt: finished ? event.createdAt : null,
    outcome: finished ? event.outcome : null,
    durationMs: finished ? event.durationMs : null,
    exitStatus: finished ? event.exitStatus : null,
  };
  return mergeToolActivity(previous, [call]);
}
