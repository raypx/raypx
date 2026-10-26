import {
  MAX_DIFF_LINES as limit,
  replacementDiff as replacement,
  unifiedDiff,
  type DiffFile,
} from "../model/diff.js";
export type { DiffFile, DiffLine } from "../model/diff.js";

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const string = (value: unknown) => (typeof value === "string" ? value : "");

/** One budget covers the complete request, including independent provider edits. */
function preview(files: DiffFile[]): DiffFile[] {
  let remaining = limit;
  return files.slice(0, 20).map((file) => {
    const lines = file.lines.slice(0, remaining);
    remaining -= lines.length;
    return {
      ...file,
      lines,
      truncated: file.truncated || lines.length < file.lines.length || files.length > 20,
    };
  });
}

/** Codex also emits unnumbered snippet hunks. They have no source line numbers
 * and are not unified patches; keep this provider extension out of the parser. */
function codexDiff(path: string, diff: string): DiffFile[] {
  const rows = diff.split("\n"),
    start = rows.findIndex((line) => line === "@@");
  if (start < 0) return unifiedDiff(path, diff);
  if (rows.some((line) => /^@@ -\d/.test(line) || line.startsWith("diff --git "))) return [];
  const prefix = rows.slice(0, start).filter((line) => line.length);
  if (
    prefix.length &&
    (prefix.length !== 2 || !prefix[0]?.startsWith("--- ") || !prefix[1]?.startsWith("+++ "))
  )
    return [];
  const lines: DiffFile["lines"] = [];
  for (const row of rows.slice(start)) {
    let line: DiffFile["lines"][number] | undefined;
    if (row === "@@") line = { kind: "hunk", text: row };
    else if (row.startsWith("+")) line = { kind: "add", text: row.slice(1) };
    else if (row.startsWith("-")) line = { kind: "remove", text: row.slice(1) };
    else if (row.startsWith(" ")) line = { kind: "context", text: row.slice(1) };
    else if (row.trim()) return [];
    if (line && lines.length < limit) lines.push(line);
  }
  return [{ path, lines, truncated: rows.length - start > limit }];
}

/** Recognize only the apply_patch subset this preview can represent. Validate
 * the whole envelope before bounding it; other operations keep the original. */
function applyPatchRows(patch: string) {
  const rows = patch.split("\n");
  while (rows.at(-1) === "") rows.pop();
  if (rows[0] !== "*** Begin Patch" || rows.at(-1) !== "*** End Patch") return undefined;
  let kind: string | undefined;
  for (const row of rows.slice(1, -1)) {
    const header = /^\*\*\* (Add|Update) File: (.+)$/.exec(row);
    if (header) kind = header[1];
    else if (
      !kind ||
      (!row.startsWith("+") &&
        !(
          kind === "Update" &&
          (/^[ -]/.test(row) || /^@@(?: |$)/.test(row) || row === "*** End of File")
        ))
    )
      return undefined;
  }
  return rows;
}
/** Only recognized provider edit formats become a Diff. Unknown requests retain the raw view. */
export function approvalChanges(body: string): DiffFile[] {
  if (body.length > 128_000) return [];
  let value: Record<string, unknown>;
  try {
    value = object(JSON.parse(body));
  } catch {
    value = {};
  }
  const path = string(value.file_path);
  if (path && Array.isArray(value.edits)) {
    const edits = value.edits;
    if (
      edits.some((edit) => {
        const item = object(edit);
        return typeof item.old_string !== "string" || typeof item.new_string !== "string";
      })
    )
      return [];
    return preview(
      edits.slice(0, 20).map((edit) => {
        const item = object(edit);
        const file = replacement(path, string(item.old_string), string(item.new_string));
        file.truncated ||= edits.length > 20;
        return file;
      }),
    );
  }
  if (path && ("old_string" in value || "new_string" in value)) {
    if (typeof value.old_string !== "string" || typeof value.new_string !== "string") return [];
    return preview([replacement(path, value.old_string, value.new_string)]);
  }
  if (path && typeof value.content === "string")
    return preview([
      {
        path,
        originalUnknown: true,
        truncated: value.content.split("\n").length > limit,
        lines: value.content
          .split("\n")
          .slice(0, limit)
          .map((text) => ({ kind: "context" as const, text })),
      },
    ]);
  if (Array.isArray(value.changes)) {
    const changes = value.changes;
    if (
      changes.some((change) => {
        const item = object(change);
        return (
          typeof item.path !== "string" ||
          typeof item.diff !== "string" ||
          !["add", "delete", "update"].includes(string(object(item.kind).type))
        );
      })
    )
      return [];
    const parsed = changes.map((change) => {
      const item = object(change),
        kind = object(item.kind);
      const output =
        kind.type === "add"
          ? [replacement(string(item.path), "", string(item.diff))]
          : kind.type === "delete"
            ? [replacement(string(item.path), string(item.diff), "")]
            : codexDiff(string(item.path), string(item.diff));
      if (typeof kind.move_path === "string" && kind.move_path && output[0]) {
        output[0].previousPath = string(item.path);
        output[0].path = kind.move_path;
      }
      return output;
    });
    // A partially understood request must not hide its unparsed files behind a Diff tab.
    if (parsed.some((files) => !files.length)) return [];
    const files = parsed.flat();
    for (const file of files) file.truncated ||= changes.length > 20 || files.length > 20;
    return preview(files);
  }
  const patch = string(value.patch ?? value.input) || body;
  const rows = applyPatchRows(patch);
  if (!rows) return [];
  const files: DiffFile[] = [];
  let current: DiffFile | undefined;
  for (const line of rows) {
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
  return preview(files);
}
