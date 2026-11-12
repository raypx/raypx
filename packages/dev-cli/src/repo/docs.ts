import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** Reports relative Markdown links whose target file does not exist. */
export function checkDocumentLinks(root: string, files: readonly string[]): string[] {
  const findings: string[] = [];
  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    for (const match of source.matchAll(/\]\(([^\s)]+)(?:\s+"[^"]*")?\)/g)) {
      const url = match[1]!;
      if (/^(?:[a-z]+:|#|\/)/i.test(url)) continue;
      const path = url.split("#")[0]!.split("?")[0]!;
      if (path && !existsSync(resolve(root, file, "..", decodeURIComponent(path))))
        findings.push(`${file}: broken documentation link ${url}`);
    }
  }
  return findings;
}
