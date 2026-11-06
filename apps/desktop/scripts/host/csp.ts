import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseServerOrigin } from "../../config";

/** Hash the exact prerendered startup scripts, without permitting arbitrary inline JS. */
export function secureHtml(
  html: string,
  options: { browserPreview?: boolean; apiOrigin?: string } = {},
): string {
  const origin =
    options.browserPreview && options.apiOrigin ? parseServerOrigin(options.apiOrigin) : undefined;
  // Browser acceptance uses Fetch directly; packaged Native uses its HTTP proxy.
  const loopback = origin?.startsWith("http://") ? ` ${origin}` : "";
  const hashes = new Set<string>();
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1]!))
      hashes.add(`'sha256-${createHash("sha256").update(match[2]!).digest("base64")}'`);
  }
  const policy = `default-src 'none'; script-src 'self' ${[...hashes].join(" ")}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self' https:${loopback}; object-src 'none'; base-uri 'none'; form-action 'none'`;
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
  const options = {
    browserPreview: directory === resolve(import.meta.dirname, "../../artifacts/browser/client"),
    ...(process.env.VITE_API_URL ? { apiOrigin: process.env.VITE_API_URL } : {}),
  };
  let count = 0;
  for await (const file of new Bun.Glob("**/*.html").scan({ cwd: directory, absolute: true })) {
    await writeFile(file, secureHtml(await readFile(file, "utf8"), options));
    count++;
  }
  if (!count) throw new Error("Desktop prerendered HTML is missing");
}
