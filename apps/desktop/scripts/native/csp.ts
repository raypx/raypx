import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Hash the exact prerendered startup scripts, without permitting arbitrary inline JS. */
export function secureHtml(html: string): string {
  const hashes = new Set<string>();
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1]!))
      hashes.add(`'sha256-${createHash("sha256").update(match[2]!).digest("base64")}'`);
  }
  const policy = `default-src 'none'; script-src 'self' views: ${[...hashes].join(" ")}; style-src 'self' views: 'unsafe-inline'; img-src 'self' views: data: blob:; font-src 'self' views: data:; connect-src 'self' views: https: ws://127.0.0.1:*; object-src 'none'; base-uri 'none'; form-action 'none'`;
  return html
    .replace(/<meta\b[^>]*http-equiv=["']Content-Security-Policy["'][^>]*>/gi, "")
    .replace(
      /<head\b[^>]*>/i,
      (head) => `${head}<meta http-equiv="Content-Security-Policy" content="${policy}">`,
    );
}

if (import.meta.main) {
  const directory = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : resolve(import.meta.dirname, "../../dist/client");
  let count = 0;
  for await (const file of new Bun.Glob("**/*.html").scan({ cwd: directory, absolute: true })) {
    await writeFile(file, secureHtml(await readFile(file, "utf8")));
    count++;
  }
  if (!count) throw new Error("Desktop prerendered HTML is missing");
}
