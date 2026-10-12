import { gzipSync } from "node:zlib";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

type ManifestRoute = {
  preloads?: string[];
  scripts?: Array<{ attrs?: { src?: string } }>;
};

type StartManifest = {
  routes?: Record<string, ManifestRoute>;
};

const appRoot = resolve(process.cwd());
const outputRoot = join(appRoot, ".output");
const publicRoot = join(outputRoot, "public");
const serverRoot = join(outputRoot, "server");

async function findManifest() {
  const entries = await readdir(serverRoot);
  const name = entries.find(
    (entry) => entry.startsWith("_tanstack-start-manifest_") && entry.endsWith(".mjs"),
  );
  if (!name)
    throw new Error("No TanStack Start manifest found. Run `bun run --cwd apps/web build` first.");
  return join(serverRoot, name);
}

async function fileSize(href: string) {
  const path = join(publicRoot, href.replace(/^\//, ""));
  const bytes = await readFile(path);
  return { raw: bytes.byteLength, gzip: gzipSync(bytes, { level: 9 }).byteLength };
}

function formatBytes(bytes: number) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}

const manifestPath = await findManifest();
const { tsrStartManifest } = await import(pathToFileURL(manifestPath).href);
const manifest = tsrStartManifest() as StartManifest;
const root = manifest.routes?.__root__;
const home = manifest.routes?.["/"];
if (!root || !home) throw new Error("Manifest is missing the __root__ or / route.");

const htmlScripts = (root.scripts ?? [])
  .map((script) => script.attrs?.src)
  .filter((src): src is string => Boolean(src));
const initialAssets = [
  ...new Set([...(root.preloads ?? []), ...(home.preloads ?? []), ...htmlScripts]),
];
const measures = await Promise.all(
  initialAssets.map(async (href) => ({ href, ...(await fileSize(href)) })),
);
const total = measures.reduce(
  (sum, item) => ({ raw: sum.raw + item.raw, gzip: sum.gzip + item.gzip }),
  { raw: 0, gzip: 0 },
);
const entry = measures.find((item) => /\/index-[^/]+\.js$/.test(item.href));

const coldCache = await stat(publicRoot).then(() => ({
  raw: total.raw,
  gzip: total.gzip,
  note: "estimated from production assets with level-9 gzip; excludes HTML/CSS and HTTP headers",
}));

console.log(
  JSON.stringify(
    {
      build: manifestPath,
      routes: ["__root__", "/"],
      htmlScriptCount: htmlScripts.length,
      initialRequestCount: initialAssets.length,
      entryChunk: entry
        ? { href: entry.href, raw: formatBytes(entry.raw), gzip: formatBytes(entry.gzip) }
        : null,
      initialJavaScript: { raw: formatBytes(total.raw), gzip: formatBytes(total.gzip) },
      coldCacheTransfer: {
        raw: formatBytes(coldCache.raw),
        gzip: formatBytes(coldCache.gzip),
        note: coldCache.note,
      },
      assets: measures.map(({ href, raw, gzip }) => ({
        href,
        raw: formatBytes(raw),
        gzip: formatBytes(gzip),
      })),
    },
    null,
    2,
  ),
);
