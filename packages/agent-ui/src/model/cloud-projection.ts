import type { CloudConversationSnapshotDto, CloudRunSnapshotDto } from "@voidmix/contracts";
import type { CloudTimelineItem, ConversationMessage } from "./cloud";

/** Cache the durable conversation index; token updates replace only their assistant row. */
export function createConversationProjection() {
  let previous: CloudConversationSnapshotDto | null = null;
  let rows: ConversationMessage[] = [];
  let base: ConversationMessage[] = [];
  const retained = new Map<string, ConversationMessage>();
  const row = (next: ConversationMessage) => {
    const old = retained.get(next.id);
    if (
      old?.text === next.text &&
      old.role === next.role &&
      Boolean(old.streaming) === Boolean(next.streaming)
    )
      return old;
    retained.set(next.id, next);
    return next;
  };
  return (data: CloudConversationSnapshotDto, active: CloudRunSnapshotDto | null = null) => {
    if (previous !== data) {
      previous = data;
      const runById = new Map(data.runs.map((run) => [run.id, run]));
      const grouped = new Map<string, typeof data.runs>();
      for (const run of data.runs) {
        let original = run;
        const seen = new Set<string>();
        while (original.retryOfRunId && !seen.has(original.id)) {
          seen.add(original.id);
          const ancestor = runById.get(original.retryOfRunId);
          if (!ancestor) break;
          original = ancestor;
        }
        const group = grouped.get(original.turnId) ?? [];
        group.push(run);
        grouped.set(original.turnId, group);
      }
      base = [];
      for (const turn of [...data.turns].sort(
        (a, b) => a.createdAt.valueOf() - b.createdAt.valueOf(),
      )) {
        base.push(row({ id: turn.id, role: "user", text: turn.prompt }));
        for (const run of (grouped.get(turn.id) ?? []).sort((a, b) => a.attempt - b.attempt)) {
          // An empty assistant slot also anchors a live Run whose first token is not here yet.
          base.push(row({ id: run.id, role: "assistant", text: run.output ?? "" }));
        }
      }
      const ids = new Set(base.map((item) => item.id));
      for (const id of retained.keys()) if (!ids.has(id)) retained.delete(id);
    }
    let live: ConversationMessage | null = null;
    if (active) {
      const roots = new Set(
        active.executions
          .filter((execution) => !execution.parentId)
          .map((execution) => execution.id),
      );
      const text =
        active.run.output ??
        active.messages
          .filter((message) => !message.executionId || roots.has(message.executionId))
          .map((message) => message.text)
          .join("\n\n");
      live = row({
        id: active.run.id,
        role: "assistant",
        text,
        streaming: ["queued", "running"].includes(active.run.status),
      });
    }
    const next = base
      .map((item) => (live?.id === item.id ? live : item))
      .filter((item) => item.role === "user" || Boolean(item.text));
    if (rows.length === next.length && rows.every((item, index) => item === next[index]))
      return rows;
    rows = next;
    return rows;
  };
}

/** Fold each appended event once, preserving unaffected row references between tokens. */
export function createCloudTimelineProjection() {
  let runId: string | null = null;
  let cursor = 0;
  let earliest = Number.POSITIVE_INFINITY;
  let events: CloudTimelineItem[] = [];
  let rows: CloudTimelineItem[] = [];
  const toolPositions = new Map<string, number>();
  const executionRows = new Map<string, CloudTimelineItem>();
  return (data: CloudRunSnapshotDto): CloudTimelineItem[] => {
    const first = data.events[0]?.sequence ?? Number.POSITIVE_INFINITY;
    if (runId !== data.run.id || data.cursor < cursor || first < earliest) {
      runId = data.run.id;
      cursor = 0;
      earliest = first;
      events = [];
      toolPositions.clear();
      executionRows.clear();
    }
    let lower = 0;
    let upper = data.events.length;
    while (lower < upper) {
      const middle = (lower + upper) >>> 1;
      if (data.events[middle]!.sequence <= cursor) lower = middle + 1;
      else upper = middle;
    }
    for (let index = lower; index < data.events.length; index++) {
      const event = data.events[index]!;
      cursor = event.sequence;
      if (
        (event.type === "tool.started" || event.type === "tool.completed") &&
        typeof event.payload.callId === "string" &&
        typeof event.payload.name === "string"
      ) {
        const position = toolPositions.get(event.payload.callId);
        const old = position === undefined ? undefined : events[position];
        const tool = {
          id: event.payload.callId,
          name: event.payload.name,
          status:
            event.type === "tool.completed"
              ? event.payload.isError
                ? ("failed" as const)
                : ("succeeded" as const)
              : ("running" as const),
          ...(typeof event.payload.summary === "string"
            ? { summary: event.payload.summary }
            : old?.kind === "tool" && old.tool.summary
              ? { summary: old.tool.summary }
              : {}),
        };
        if (position === undefined) {
          toolPositions.set(tool.id, events.length);
          events.push({ id: `${event.runId}:${event.sequence}`, kind: "tool", tool });
        } else if (
          old?.kind === "tool" &&
          (old.tool.status !== tool.status || old.tool.summary !== tool.summary)
        )
          events[position] = { ...old, tool };
      } else if (event.type === "run.status") {
        const status = event.payload.status;
        if (
          status === "queued" ||
          status === "running" ||
          status === "needs_input" ||
          status === "succeeded" ||
          status === "failed" ||
          status === "cancelled"
        )
          events.push({ id: `${event.runId}:${event.sequence}`, kind: "status", status });
      }
    }
    const children: CloudTimelineItem[] = [];
    for (const execution of data.executions) {
      if (!execution.parentId) continue;
      const old = executionRows.get(execution.id);
      const next =
        old?.kind === "execution" && old.role === execution.role && old.status === execution.status
          ? old
          : {
              id: execution.id,
              kind: "execution" as const,
              role: execution.role,
              status: execution.status,
            };
      executionRows.set(execution.id, next);
      children.push(next);
    }
    const next = [...events, ...children];
    if (rows.length === next.length && rows.every((item, index) => item === next[index]))
      return rows;
    rows = next;
    return rows;
  };
}
