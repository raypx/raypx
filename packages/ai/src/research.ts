import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";
import { request as httpRequest } from "node:http";

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 192 && (b === 0 || b === 2)) ||
      (a === 198 && b === 51) ||
      (a === 203 && b === 0)
    );
  }
  if (isIP(address) === 6) {
    // URL normalizes leading zeroes and compressed groups before range checks.
    const normalized = new URL(`http://[${address}]/`).hostname.slice(1, -1).toLowerCase();
    const [first, second] = normalized.split(":").map((group) => parseInt(group || "0", 16));
    // Global unicast only; exclude special, documentation and transition blocks.
    return (
      first !== undefined &&
      first >= 0x2000 &&
      first < 0x4000 &&
      first !== 0x2002 &&
      first !== 0x3fff &&
      !(first === 0x2001 && (second! < 0x200 || second === 0xdb8))
    );
  }
  return false;
}

export function validateSourceUrl(value: string): URL {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.hostname.length > 253 ||
    !url.hostname.includes(".") ||
    isIP(url.hostname.replace(/^\[|\]$/g, "")) ||
    (url.port && url.port !== (url.protocol === "https:" ? "443" : "80"))
  )
    throw new Error("Source URL must be a public HTTP(S) hostname.");
  url.hash = "";
  return url;
}

/** DNS is validated and pinned per hop, including redirects, to prevent rebinding. */
export async function readPublicSource(
  value: string,
  signal?: AbortSignal,
): Promise<{ url: string; title: string; text: string }> {
  let url = validateSourceUrl(value);
  for (let redirects = 0; redirects <= 3; redirects++) {
    signal?.throwIfAborted();
    const addresses = await lookup(url.hostname, { all: true });
    if (!addresses.length || addresses.some((address) => !isPublicAddress(address.address)))
      throw new Error("Source hostname resolves to a non-public address.");
    const address = addresses[0]!;
    const response = await new Promise<{
      status: number;
      location?: string;
      contentType: string;
      body: Buffer;
    }>((resolve, reject) => {
      const transport = url.protocol === "https:" ? request : httpRequest;
      const req = transport(
        url,
        {
          signal,
          timeout: 15_000,
          headers: { "User-Agent": "VoidmixResearch/1.0", Accept: "text/html,text/plain" },
          lookup: (_hostname, options, callback) =>
            callback(null, options.all ? [address] : address.address, address.family),
        },
        (res) => {
          const chunks: Buffer[] = [];
          let size = 0;
          res.on("data", (chunk: Buffer) => {
            size += chunk.byteLength;
            if (size > 2 * 1024 * 1024) {
              res.destroy(new Error("Source exceeds 2MiB limit."));
              return;
            }
            chunks.push(chunk);
          });
          res.on("error", reject);
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              contentType: res.headers["content-type"] ?? "",
              ...(res.headers.location ? { location: res.headers.location } : {}),
              body: Buffer.concat(chunks),
            }),
          );
        },
      );
      req.on("timeout", () => req.destroy(new Error("Source read timed out.")));
      req.on("error", reject);
      req.end();
    });
    if (response.status >= 300 && response.status < 400 && response.location) {
      url = validateSourceUrl(new URL(response.location, url).href);
      continue;
    }
    if (response.status < 200 || response.status >= 300)
      throw new Error(`Source returned HTTP ${response.status}.`);
    if (!/^text\/(html|plain)(?:;|$)/i.test(response.contentType))
      throw new Error("Source media type is unsupported.");
    const html = response.body.toString("utf8");
    const title =
      html
        .match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
        ?.replace(/<[^>]+>/g, "")
        .trim() ?? url.hostname;
    const text = html
      .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<!--[^]*?-->/g, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100_000);
    return { url: url.href, title, text };
  }
  throw new Error("Source redirected too many times.");
}

export async function searchWeb(
  query: string,
  options: { apiKey?: string; signal?: AbortSignal },
): Promise<{ url: string; title: string; excerpt: string }[]> {
  if (!options.apiKey)
    throw Object.assign(new Error("Search is unavailable."), { code: "SEARCH_UNAVAILABLE" });
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query.slice(0, 2000));
  url.searchParams.set("count", "8");
  const response = await fetch(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": options.apiKey },
    signal: options.signal
      ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)])
      : AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Search provider returned HTTP ${response.status}.`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Search provider returned no content.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > 2 * 1024 * 1024) throw new Error("Search response exceeds limit.");
      chunks.push(next.value);
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  const body = Buffer.concat(chunks).toString("utf8");
  const data = JSON.parse(body) as {
    web?: { results?: { url?: string; title?: string; description?: string }[] };
  };
  return (data.web?.results ?? []).slice(0, 8).flatMap((result) => {
    if (!result.url) return [];
    try {
      return [
        {
          url: validateSourceUrl(result.url).href,
          title: (result.title ?? result.url).slice(0, 300),
          excerpt: (result.description ?? "").replace(/<[^>]+>/g, "").slice(0, 2000),
        },
      ];
    } catch {
      return [];
    }
  });
}
