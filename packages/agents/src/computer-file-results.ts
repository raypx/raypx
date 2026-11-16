import { createHash } from "node:crypto";
import { structuredPatch } from "diff";
import { MAX_COMPUTER_FILE_RESULT_BYTES, type ComputerFileResult } from "@raypx/core/conversation";
import {
  ComputerError,
  MAX_COMPUTER_EDIT_BYTES,
  type ComputerProvider,
  type ComputerRef,
  type FileSearchResult,
} from "@raypx/providers/computer";

function fits(value: ComputerFileResult) {
  return Buffer.byteLength(JSON.stringify(value), "utf8") <= MAX_COMPUTER_FILE_RESULT_BYTES;
}

export function searchFileResult(value: FileSearchResult): ComputerFileResult {
  const result: ComputerFileResult = { kind: "search", matches: [], truncated: value.truncated };
  for (const match of value.matches) {
    if (!fits({ ...result, matches: [...result.matches, match] })) {
      result.truncated = true;
      break;
    }
    result.matches.push(match);
  }
  return result;
}

function editFileResult(path: string, before: string, after: string): ComputerFileResult | null {
  const patch = structuredPatch(path, path, before, after, undefined, undefined, {
    context: 2,
    maxEditLength: 5_000,
    timeout: 100,
  });
  if (!patch?.hunks.length) return null;
  const result: ComputerFileResult = { kind: "edit", path, hunks: [], truncated: false };
  for (const { oldStart, newStart, lines } of patch.hunks) {
    if (result.hunks.length === 8) return { ...result, truncated: true };
    const hunk = { oldStart, newStart, lines: [] as string[] };
    result.hunks.push(hunk);
    for (const line of lines) {
      if (hunk.lines.length === 80) return { ...result, truncated: true };
      const excerpt =
        line.length <= 401 ? line : line.slice(0, 399).replace(/[\uD800-\uDBFF]$/, "") + "…";
      result.truncated ||= excerpt !== line;
      hunk.lines.push(excerpt);
      if (!fits(result)) {
        hunk.lines.pop();
        if (!hunk.lines.length) result.hunks.pop();
        return { ...result, truncated: true };
      }
    }
  }
  return result;
}

export async function exactFileEdit(
  provider: ComputerProvider,
  ref: ComputerRef,
  { path, oldText, newText }: { path: string; oldText: string; newText: string },
  isCancelled: () => boolean,
  checkOutput: (text: string) => void,
): Promise<{ result: ComputerFileResult } | { failure: string }> {
  if (!provider.replaceFile) return { failure: "COMPUTER_EDIT_UNAVAILABLE" };
  if (oldText === newText) return { failure: "COMPUTER_EDIT_UNCHANGED" };
  if (Buffer.from(newText, "utf8").toString("utf8") !== newText)
    return { failure: "COMPUTER_EDIT_REQUIRES_UTF8" };
  const read = await provider.read(ref, path, MAX_COMPUTER_EDIT_BYTES).catch((error: unknown) => {
    if (error instanceof ComputerError && error.code === "LIMIT_EXCEEDED") return null;
    throw error;
  });
  if (!read) return { failure: "COMPUTER_EDIT_FILE_TOO_LARGE" };
  const bytes = Buffer.from(read.bytes, "base64");
  if (bytes.length > MAX_COMPUTER_EDIT_BYTES) return { failure: "COMPUTER_EDIT_FILE_TOO_LARGE" };
  let before: string;
  try {
    before = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    return { failure: "COMPUTER_EDIT_REQUIRES_UTF8" };
  }
  if (before.includes("\0")) return { failure: "COMPUTER_EDIT_REQUIRES_UTF8" };
  const index = before.indexOf(oldText);
  if (index < 0) return { failure: "COMPUTER_EDIT_TEXT_NOT_FOUND" };
  if (before.indexOf(oldText, index + 1) !== -1)
    return { failure: "COMPUTER_EDIT_TEXT_NOT_UNIQUE" };
  const after = before.slice(0, index) + newText + before.slice(index + oldText.length);
  if (Buffer.byteLength(after, "utf8") > MAX_COMPUTER_EDIT_BYTES)
    return { failure: "COMPUTER_EDIT_FILE_TOO_LARGE" };
  checkOutput(before);
  checkOutput(after);
  const result = editFileResult(path, before, after);
  if (!result) return { failure: "COMPUTER_EDIT_DIFF_LIMIT" };
  if (isCancelled()) return { failure: "CANCELLED" };
  const commit = await provider.replaceFile(ref, path, {
    expected: createHash("sha256").update(bytes).digest("hex"),
    bytes: Buffer.from(after, "utf8").toString("base64"),
  });
  if (!commit.replaced) return { failure: "COMPUTER_EDIT_STALE_FILE" };
  return { result };
}
