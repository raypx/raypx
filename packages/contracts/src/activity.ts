import type { TaskActivity } from "./tasks.js";

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
