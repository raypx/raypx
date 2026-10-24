export type DiffLine = {
  kind: "add" | "remove" | "context" | "hunk";
  text: string;
  old?: number;
  next?: number;
};
export type DiffFile = { path: string; lines: DiffLine[]; truncated: boolean };
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const string = (value: unknown) => (typeof value === "string" ? value : "");
const limit = 1200;
function unified(path: string, diff: string): DiffFile {
  let old = 0,
    next = 0;
  const lines: DiffLine[] = [];
  const source = diff.split("\n");
  for (const text of source.slice(0, limit)) {
    const hunk = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(text);
    if (hunk) {
      old = Number(hunk[1]);
      next = Number(hunk[2]);
      lines.push({ kind: "hunk", text });
    } else if (
      text.startsWith("--- ") ||
      text.startsWith("+++ ") ||
      text.startsWith("diff ") ||
      text.startsWith("index ")
    )
      continue;
    else if (text.startsWith("+"))
      lines.push({ kind: "add", text: text.slice(1), ...(next ? { next: next++ } : {}) });
    else if (text.startsWith("-"))
      lines.push({ kind: "remove", text: text.slice(1), ...(old ? { old: old++ } : {}) });
    else if (text.startsWith(" "))
      lines.push({
        kind: "context",
        text: text.slice(1),
        ...(old ? { old: old++ } : {}),
        ...(next ? { next: next++ } : {}),
      });
    else if (text.trim()) lines.push({ kind: "hunk", text });
  }
  return { path, lines, truncated: source.length > limit };
}
function replacement(path: string, before: string, after: string): DiffFile {
  const a = before ? before.split("\n") : [],
    b = after ? after.split("\n") : [];
  let head = 0,
    tail = 0;
  while (head < Math.min(a.length, b.length) && a[head] === b[head]) head++;
  while (
    tail < Math.min(a.length, b.length) - head &&
    a[a.length - tail - 1] === b[b.length - tail - 1]
  )
    tail++;
  const lines: DiffLine[] = [];
  for (let i = Math.max(0, head - 3); i < head && lines.length < limit; i++)
    lines.push({ kind: "context", text: a[i]!, old: i + 1, next: i + 1 });
  for (let i = head; i < a.length - tail && lines.length < limit; i++)
    lines.push({ kind: "remove", text: a[i]!, old: i + 1 });
  for (let i = head; i < b.length - tail && lines.length < limit; i++)
    lines.push({ kind: "add", text: b[i]!, next: i + 1 });
  for (let i = 0; i < Math.min(tail, 3) && lines.length < limit; i++)
    lines.push({
      kind: "context",
      text: a[a.length - tail + i]!,
      old: a.length - tail + i + 1,
      next: b.length - tail + i + 1,
    });
  return { path, lines, truncated: a.length + b.length - head * 2 - tail * 2 > limit - 6 };
}
/** Only recognized provider edit formats become a Diff. Unknown requests retain the raw view. */
export function approvalChanges(body: string): DiffFile[] {
  let value: Record<string, unknown>;
  try {
    value = object(JSON.parse(body));
  } catch {
    value = {};
  }
  const path = string(value.file_path);
  if (path && Array.isArray(value.edits))
    return value.edits.slice(0, 20).map((edit) => {
      const item = object(edit);
      return replacement(path, string(item.old_string), string(item.new_string));
    });
  if (path && (typeof value.old_string === "string" || typeof value.content === "string"))
    return [replacement(path, string(value.old_string), string(value.new_string ?? value.content))];
  if (Array.isArray(value.changes))
    return value.changes.slice(0, 20).flatMap((change) => {
      const item = object(change);
      return typeof item.path === "string" && typeof item.diff === "string"
        ? [unified(item.path, item.diff)]
        : [];
    });
  const patch = string(value.patch ?? value.input) || body;
  if (!patch.includes("*** Begin Patch")) return [];
  const files: DiffFile[] = [];
  let current: DiffFile | undefined;
  for (const line of patch.split("\n")) {
    const header = /^\*\*\* (?:Add|Update|Delete) File: (.+)$/.exec(line);
    if (header) {
      if (files.length === 20) {
        if (current) current.truncated = true;
        break;
      }
      current = { path: header[1]!, lines: [], truncated: false };
      files.push(current);
    } else if (current && !line.startsWith("*** End Patch")) {
      if (current.lines.length >= limit) {
        current.truncated = true;
        continue;
      }
      current.lines.push({
        kind: line.startsWith("+")
          ? "add"
          : line.startsWith("-")
            ? "remove"
            : line.startsWith(" ")
              ? "context"
              : "hunk",
        text: /^[+ -]/.test(line) ? line.slice(1) : line,
      });
    }
  }
  return files;
}
