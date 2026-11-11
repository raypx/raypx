import type { AgentEvent, TaskActivity } from "./tasks.js";

/** Undefined means the consumer must recover an authoritative checkpoint. */
export function applyActivityEvent(
  previous: TaskActivity | undefined,
  event: AgentEvent,
): TaskActivity | undefined {
  if (event.kind === "activity")
    return !previous || event.entry.revision > previous.revision ? event.entry : previous;
  if (
    event.kind !== "activity_delta" ||
    previous?.kind !== "message" ||
    previous.id !== event.entryId ||
    previous.taskId !== event.taskId
  )
    return undefined;
  if (previous.revision >= event.revision) return previous;
  if (
    previous.status !== "streaming" ||
    previous.revision !== event.baseRevision ||
    event.revision !== event.baseRevision + 1 ||
    previous.text.length + event.append.length > 32_000
  )
    return undefined;
  return {
    ...previous,
    text: previous.text + event.append,
    revision: event.revision,
    updatedAt: event.updatedAt,
    truncated: event.truncated,
  };
}

function utf8Bytes(value: string) {
  let size = 0;
  for (const character of value) {
    const point = character.codePointAt(0)!;
    size += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return size;
}
/** A bounded page of the latest revision of each normalized activity entry. */
export function taskActivityPage(entries: Iterable<TaskActivity>, before?: number) {
  const latest = new Map<string, TaskActivity>();
  for (const entry of entries) {
    const old = latest.get(entry.id);
    if (!old || entry.revision > old.revision) latest.set(entry.id, entry);
  }
  const ordered = [...latest.values()]
    .filter((entry) => before === undefined || entry.order < before)
    .sort((a, b) => b.order - a.order);
  const page: TaskActivity[] = [];
  let bytes = 0;
  for (const entry of ordered) {
    const size = utf8Bytes(JSON.stringify(entry));
    if (page.length && (page.length >= 64 || bytes + size > 192 * 1024)) break;
    page.push(entry);
    bytes += size;
  }
  return {
    activity: page.reverse(),
    ...(page.length < ordered.length && page[0] ? { activityBefore: page[0].order } : {}),
  };
}
