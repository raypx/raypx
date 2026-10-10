import { posix } from "node:path";
import type { PolicyFinding } from "./report.ts";
import type { PolicyRepository } from "./runtime.ts";

function withoutCode(content: string): string {
  let fence: { character: string; length: number } | undefined;
  return content
    .replace(/<!--[\s\S]*?-->/g, "")
    .split("\n")
    .map((line) => {
      const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker) {
        if (!fence) fence = { character: marker[0] ?? "", length: marker.length };
        else if (marker[0] === fence.character && marker.length >= fence.length) fence = undefined;
        return "";
      }
      return fence || /^(?: {4}|\t)/.test(line) ? "" : line;
    })
    .join("\n")
    .replace(/(`+)[\s\S]*?\1/g, "");
}

function destinations(content: string): string[] {
  const text = withoutCode(content);
  const found: string[] = [];
  for (let opening = 0; opening < text.length; opening++) {
    if (text[opening] !== "[" || text[opening - 1] === "\\") continue;
    let index = opening + 1;
    let labelDepth = 1;
    for (; index < text.length && labelDepth; index++) {
      if (text[index] === "\\") index++;
      else if (text[index] === "[") labelDepth++;
      else if (text[index] === "]") labelDepth--;
    }
    if (labelDepth || text[index] !== "(") continue;
    index++;
    while (/\s/.test(text[index] ?? "") && index < text.length) index++;
    const angled = text[index] === "<";
    if (angled) index++;
    let destination = "";
    let depth = 0;
    for (; index < text.length; index++) {
      const character = text[index];
      if (character === "\\" && text[index + 1] !== undefined) {
        destination += text[++index];
        continue;
      }
      if (angled ? character === ">" : (character === ")" && !depth) || /\s/.test(character ?? ""))
        break;
      if (!angled && character === "(") depth++;
      if (!angled && character === ")") depth--;
      destination += character;
    }
    if (destination) found.push(destination);
  }
  const label = (value: string) => value.trim().replace(/\s+/g, " ").toLowerCase();
  const references = new Map<string, string>();
  for (const match of text.matchAll(/^\s{0,3}\[([^\]\n]+)\]:\s*(?:<([^>\n]+)>|(\S+))/gm)) {
    if (match[1] && (match[2] || match[3]))
      references.set(label(match[1]), match[2] ?? match[3] ?? "");
  }
  for (const match of text.matchAll(/!?\[([^\]\n]+)\](?:\[([^\]\n]*)\])?/g)) {
    const next = text[match.index + match[0].length];
    if (next === "(" || next === ":" || text[match.index - 1] === "\\") continue;
    const reference = references.get(label(match[2] || match[1] || ""));
    if (reference) found.push(reference);
  }
  return [...new Set(found)];
}

/** Check local file links and transitive docs navigation, without fetching external URLs. */
export async function checkMarkdown(
  repository: PolicyRepository,
  findings: PolicyFinding[],
): Promise<void> {
  const markdown = [...repository.files].filter((path) => /\.md$/i.test(path)).sort();
  const edges = new Map<string, string[]>();
  for (const path of markdown) {
    const content = await repository.read(path);
    if (content === undefined) continue;
    const links: string[] = [];
    for (const destination of destinations(content)) {
      if (/^(?:#|\/\/|[a-z][a-z\d+.-]*:)/i.test(destination)) continue;
      let decoded: string;
      try {
        decoded = decodeURIComponent(destination.split(/[?#]/)[0] ?? "");
      } catch {
        findings.push({
          rule: "docs.link",
          path,
          message: `Invalid local link encoding: ${destination}.`,
          fix: "Correct the URL encoding in this local Markdown link.",
        });
        continue;
      }
      if (!decoded) continue;
      const resolved = posix.normalize(
        decoded.startsWith("/") ? decoded.slice(1) : posix.join(posix.dirname(path), decoded),
      );
      if (resolved === ".." || resolved.startsWith("../") || !(await repository.exists(resolved))) {
        findings.push({
          rule: "docs.link",
          path,
          message: `Local link target does not exist inside the repository: ${destination}.`,
          fix: "Point the link to an existing first-party file or directory.",
        });
      } else if (/\.md$/i.test(resolved) && repository.files.has(resolved)) links.push(resolved);
    }
    edges.set(path, links);
  }
  const index = "docs/INDEX.md";
  if (!repository.files.has(index) || (await repository.read(index)) === undefined) {
    findings.push({
      rule: "docs.index",
      path: index,
      message: "The documentation index is missing.",
      fix: "Create docs/INDEX.md and link the documentation from it.",
    });
    return;
  }
  const reached = new Set([index]);
  const queue = [index];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    for (const next of edges.get(queue[cursor] ?? "") ?? []) {
      if (reached.has(next)) continue;
      reached.add(next);
      queue.push(next);
    }
  }
  for (const path of markdown.filter((file) => file.startsWith("docs/") && !reached.has(file)))
    findings.push({
      rule: "docs.index",
      path,
      message: "Document is not reachable from docs/INDEX.md.",
      fix: "Link it from docs/INDEX.md or another reachable document, including an archive index where appropriate.",
    });
}
