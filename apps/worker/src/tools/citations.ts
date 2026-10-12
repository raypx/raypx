/** Sources are supplied by the trusted host, never by a model's output. */
import { CloudExecutionError } from "../errors.js";
export function validateCitations(
  text: string,
  sources: Iterable<{ url: string }>,
  required = false,
): void {
  const normalize = (value: string) => {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol))
      throw new CloudExecutionError("SOURCE_EVIDENCE_INVALID", "Citation URL is unsupported.");
    url.hash = "";
    return url.href;
  };
  const verified = new Set([...sources].map((source) => normalize(source.url)));
  let count = 0;
  for (const match of text.matchAll(/https?:\/\//g)) {
    let value = "",
      depth = 0;
    const start = match.index;
    for (let index = start; index < text.length; index++) {
      const char = text[index]!;
      if (/[\s<>"'`\]]/.test(char)) break;
      if (char === "(") depth++;
      else if (char === ")") {
        if (depth === 0) break;
        depth--;
      }
      value += char;
    }
    value = value.replace(/[.,;]+$/, "");
    if (!verified.has(normalize(value)))
      throw new CloudExecutionError(
        "SOURCE_EVIDENCE_INVALID",
        "Citation references a source that was not found or read.",
      );
    count++;
  }
  if (required && (!verified.size || !count))
    throw new CloudExecutionError(
      "SOURCE_EVIDENCE_INVALID",
      "Search did not return and cite verifiable source evidence.",
    );
}
