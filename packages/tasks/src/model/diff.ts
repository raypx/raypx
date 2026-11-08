import { parsePatch, type StructuredPatch } from "diff";

export type DiffLine = {
  kind: "add" | "remove" | "context" | "hunk";
  text: string;
  old?: number;
  next?: number;
};
export type DiffFile = {
  path: string;
  previousPath?: string;
  lines: DiffLine[];
  truncated: boolean;
  originalUnknown?: boolean;
};
export const MAX_DIFF_LINES = 1200;
const maxInputLength = 128_000;
const filePath = (value: string | undefined) => value?.replace(/^[ab]\//, "");

/** jsdiff deliberately skips unknown prose and metadata. Approval previews may
 * only omit explicitly bounded presentation, so verify its complete source span. */
function coveredHeadings(source: string, patches: StructuredPatch[]) {
  const rows = source.split("\n"),
    hunks = patches.flatMap((patch) => patch.hunks),
    headings: string[] = [];
  const metadata =
    /^(?:diff --git .+|Index: .+|={3,}|--- .+|\+\+\+ .+|index [0-9a-f]+\.\.[0-9a-f]+(?: [0-7]{6})?|new file mode 100644|deleted file mode [0-7]{6}|(?:rename from|rename to) .+|similarity index (?:100|\d{1,2})%)$/;
  let gitMetadata = false;
  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    if (row.startsWith("@@")) {
      if (!/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@(?:.*)$/.test(row)) return undefined;
      const hunk = hunks[headings.length];
      if (
        !hunk ||
        hunk.lines.some(
          (line, offset) =>
            rows[index + offset + 1] !== line ||
            (!/^[+ -]/.test(line) && line !== "\\ No newline at end of file"),
        )
      )
        return undefined;
      headings.push(row);
      index += hunk.lines.length;
      gitMetadata = false;
    } else if (row) {
      if (!metadata.test(row)) return undefined;
      if (row.startsWith("diff --git ")) gitMetadata = true;
      else if (/^(?:Index: |=|--- |\+\+\+ )/.test(row)) gitMetadata = false;
      // Extended Git headers only belong before the file headers/hunks. The
      // library ignores even known header text placed after those boundaries.
      else if (!gitMetadata) return undefined;
    }
  }
  return headings.length === hunks.length ? headings : undefined;
}

/** Parse only complete unified text patches. Unsupported/malformed input stays raw
 * at the caller; truncation limits the view after parsing, never a hunk's input. */
export function unifiedDiff(path: string, source: string): DiffFile[] {
  if (source.length > maxInputLength) return [];
  try {
    const patches = parsePatch(source);
    if (patches.some((patch) => patch.isBinary || !patch.hunks.length)) return [];
    const headings = coveredHeadings(source, patches);
    if (!headings) return [];
    let heading = 0,
      remaining = MAX_DIFF_LINES;
    const files: DiffFile[] = [];
    for (const patch of patches.slice(0, 20)) {
      const oldPath = filePath(patch.oldFileName),
        newPath = filePath(patch.newFileName);
      const file: DiffFile = {
        path: (newPath === "/dev/null" ? oldPath : newPath) ?? path,
        lines: [],
        truncated: false,
        ...(patch.isRename && oldPath ? { previousPath: oldPath } : {}),
      };
      const push = (line: DiffLine) => {
        if (remaining > 0) {
          file.lines.push(line);
          remaining--;
        } else file.truncated = true;
      };
      for (const hunk of patch.hunks) {
        let old = hunk.oldStart,
          next = hunk.newStart;
        push({
          kind: "hunk",
          text: headings[heading++] ?? `@@ -${old},${hunk.oldLines} +${next},${hunk.newLines} @@`,
        });
        for (const line of hunk.lines) {
          if (line.startsWith("+")) push({ kind: "add", text: line.slice(1), next: next++ });
          else if (line.startsWith("-")) push({ kind: "remove", text: line.slice(1), old: old++ });
          else if (line.startsWith(" "))
            push({ kind: "context", text: line.slice(1), old: old++, next: next++ });
          else push({ kind: "hunk", text: line });
        }
      }
      files.push(file);
    }
    if (patches.length > files.length) for (const file of files) file.truncated = true;
    return files;
  } catch {
    return [];
  }
}

/** A provider replacement includes snippets, whose line numbers are snippet-local. */
export function replacementDiff(path: string, before: string, after: string): DiffFile {
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
  for (let i = Math.max(0, head - 3); i < head && lines.length < MAX_DIFF_LINES; i++)
    lines.push({ kind: "context", text: a[i]!, old: i + 1, next: i + 1 });
  for (let i = head; i < a.length - tail && lines.length < MAX_DIFF_LINES; i++)
    lines.push({ kind: "remove", text: a[i]!, old: i + 1 });
  for (let i = head; i < b.length - tail && lines.length < MAX_DIFF_LINES; i++)
    lines.push({ kind: "add", text: b[i]!, next: i + 1 });
  for (let i = 0; i < Math.min(tail, 3) && lines.length < MAX_DIFF_LINES; i++)
    lines.push({
      kind: "context",
      text: a[a.length - tail + i]!,
      old: a.length - tail + i + 1,
      next: b.length - tail + i + 1,
    });
  return {
    path,
    lines,
    truncated: a.length + b.length - head * 2 - tail * 2 > MAX_DIFF_LINES - 6,
  };
}
