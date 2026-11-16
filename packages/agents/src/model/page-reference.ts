import { pageIdSchema, type PageId } from "@raypx/core/pages";

export type MemberTextPart =
  | { kind: "text"; text: string; start: number; end: number }
  | { kind: "page"; id: PageId; text: string; start: number; end: number };

/** Recognize only the member reference emitted by Ask about this Page, never Markdown. */
export function memberTextParts(text: string, origin: string, spaceId: string): MemberTextPart[] {
  const prefix = `${origin.replace(/\/$/, "")}/api/pages/member/${encodeURIComponent(spaceId)}/`;
  const parts: MemberTextPart[] = [];
  let start = 0;
  for (const match of text.matchAll(/\[(?:Pages?|页面)\]\((https?:\/\/[^\s<>()[\]]+)\)/g)) {
    // Image, escaped and nested-label syntax is not the emitted member reference.
    if (["!", "\\", "["].includes(text[match.index - 1] ?? "")) continue;
    const url = match[1]!;
    if (!url.startsWith(prefix)) continue;
    const encoded = url.slice(prefix.length);
    let id;
    try {
      id = pageIdSchema.safeParse(decodeURIComponent(encoded));
    } catch {
      continue;
    }
    if (
      !id.success ||
      encodeURIComponent(id.data) !== encoded ||
      id.data === "." ||
      id.data === ".."
    )
      continue;
    if (match.index > start)
      parts.push({ kind: "text", text: text.slice(start, match.index), start, end: match.index });
    start = match.index + match[0].length;
    parts.push({ kind: "page", id: id.data, text: match[0], start: match.index, end: start });
  }
  if (start < text.length)
    parts.push({ kind: "text", text: text.slice(start), start, end: text.length });
  return parts;
}

/** Presentation only: the canonical draft and uncertain-send receipt keep their original text. */
export function pageReferenceDraft(parts: readonly MemberTextPart[]) {
  const references = parts.filter((part) => part.kind === "page");
  let text = "";
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index]!;
    if (part.kind !== "text") continue;
    // Ask appends this separator; remove it with the hidden reference, not user whitespace.
    const separator = parts[index + 1]?.kind === "page" && part.text.endsWith("\n\n");
    text += separator ? part.text.slice(0, -2) : part.text;
  }
  return { text, references };
}

export function withPageReferences(text: string, references: readonly { text: string }[]) {
  return [text, ...references.map((reference) => reference.text)].filter(Boolean).join("\n\n");
}
