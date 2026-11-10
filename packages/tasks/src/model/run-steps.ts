import type { AgentEvent, AgentTask, HumanRequest, TaskActivity } from "@raypx/core/tasks";

type ToolEntry = Extract<TaskActivity, { kind: "tool" }>;

export type RunStep =
  | { kind: "status"; key: string; status: AgentTask["status"] }
  | {
      kind: "request";
      key: string;
      title: string;
      requestKind: HumanRequest["kind"];
      status: HumanRequest["status"];
    }
  | {
      kind: "tools";
      key: string;
      count: number;
      running: number;
      failed: number;
      seconds: number;
    };

type ToolGroup = { key: string; entries: Map<string, ToolEntry> };

function seconds(entry: ToolEntry) {
  if (entry.status === "running") return 0;
  return Math.max(0, (Date.parse(entry.updatedAt) - Date.parse(entry.createdAt)) / 1000);
}

function summarize(group: ToolGroup): RunStep {
  const entries = [...group.entries.values()];
  return {
    kind: "tools",
    key: group.key,
    count: entries.length,
    running: entries.filter((entry) => entry.status === "running").length,
    failed: entries.filter((entry) => entry.status === "failed").length,
    seconds: entries.reduce((total, entry) => total + seconds(entry), 0),
  };
}

/**
 * Folds the loaded event page into the run's steps: one row per status change (repeats
 * collapse), one per human request at its current status, and one summary per run of
 * consecutive tool calls. Messages and streaming deltas belong to the conversation.
 */
export function runSteps(
  events: readonly { cursor: number; event: AgentEvent }[],
  requests: readonly HumanRequest[],
): RunStep[] {
  const steps: (RunStep | ToolGroup)[] = [];
  const requestIndex = new Map<string, number>();
  const current = new Map(requests.map((request) => [request.id, request]));
  for (const { cursor, event } of events) {
    const last = steps.at(-1);
    if (event.kind === "status") {
      if (last && "kind" in last && last.kind === "status" && last.status === event.status)
        continue;
      steps.push({ kind: "status", key: `status:${cursor}`, status: event.status });
    } else if (event.kind === "request") {
      const request = current.get(event.request.id) ?? event.request;
      const step: RunStep = {
        kind: "request",
        key: `request:${request.id}`,
        title: request.title,
        requestKind: request.kind,
        status: request.status,
      };
      const index = requestIndex.get(request.id);
      if (index === undefined) {
        requestIndex.set(request.id, steps.length);
        steps.push(step);
      } else steps[index] = step;
    } else if (event.kind === "activity" && event.entry.kind === "tool") {
      const group = last && "entries" in last ? last : undefined;
      if (group) group.entries.set(event.entry.id, event.entry);
      else
        steps.push({ key: `tools:${cursor}`, entries: new Map([[event.entry.id, event.entry]]) });
    }
  }
  return steps.map((step) => ("entries" in step ? summarize(step) : step));
}
