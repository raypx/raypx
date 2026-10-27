import { lstat, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import manifest from "../../package.json";

const platforms = ["darwin-aarch64", "darwin-x86_64", "windows-aarch64", "windows-x86_64"] as const;
type UpdaterPlatform = (typeof platforms)[number];
export interface UpdateManifest {
  version: string;
  pub_date: string;
  platforms: Partial<Record<UpdaterPlatform, { url: string; signature: string }>>;
}

function httpsUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Updater assets require an absolute HTTPS URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    throw new Error("Updater assets require HTTPS without credentials, query or fragment");
  return url;
}

function platform(value: string): UpdaterPlatform {
  if (!platforms.includes(value as UpdaterPlatform))
    throw new Error("Unsupported updater platform");
  return value as UpdaterPlatform;
}

export function updaterPlatform(os: string, arch: string): UpdaterPlatform {
  return platform(
    `${os === "win32" ? "windows" : os}-${arch === "arm64" ? "aarch64" : arch === "x64" ? "x86_64" : arch}`,
  );
}

async function files(directory: string, matches: (name: string) => boolean): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isFile() && matches(entry.name)) found.push(path);
    // App bundles contain thousands of unrelated runtime files. Never follow
    // symlinks or inspect their resources when selecting updater archives.
    else if (entry.isDirectory() && !entry.name.endsWith(".app"))
      found.push(...(await files(path, matches)));
  }
  return found.sort();
}

function metadata(version: string, pubDate: string) {
  if (
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(
      version,
    ) ||
    !Number.isFinite(Date.parse(pubDate))
  )
    throw new Error("Invalid updater version or publication date");
}

export async function createUpdateManifest(options: {
  bundleDirectory: string;
  assetBaseUrl?: string | undefined;
  version: string;
  platform: string;
  pubDate?: string;
}): Promise<UpdateManifest | undefined> {
  if (!options.assetBaseUrl) return;
  const base = httpsUrl(options.assetBaseUrl);
  if (!base.pathname.endsWith("/")) base.pathname += "/";
  const target = platform(options.platform);
  const pubDate = options.pubDate ?? new Date().toISOString();
  metadata(options.version, pubDate);
  const suffix = target.startsWith("darwin-") ? ".app.tar.gz" : ".exe";
  const candidates = await files(options.bundleDirectory, (name) => name.endsWith(suffix));
  if (candidates.length !== 1)
    throw new Error("Expected exactly one updater archive; clean bundle outputs before packaging");
  const archive = candidates[0]!;
  const signatureFile = `${archive}.sig`;
  const info = await lstat(signatureFile).catch(() => undefined);
  if (!info?.isFile() || info.size > 65536)
    throw new Error("Updater archive requires a bounded signature file");
  const signature = (await readFile(signatureFile, "utf8")).trim();
  if (!signature) throw new Error("Updater archive signature is empty");
  const assetPath = relative(options.bundleDirectory, archive)
    .replaceAll("\\", "/")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return {
    version: options.version,
    pub_date: pubDate,
    platforms: { [target]: { url: new URL(assetPath, base).href, signature } },
  };
}

export function mergeUpdateManifests(values: unknown[]): UpdateManifest | undefined {
  let result: UpdateManifest | undefined;
  for (const value of values) {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid updater manifest");
    const input = value as Record<string, unknown>;
    if (
      typeof input.version !== "string" ||
      typeof input.pub_date !== "string" ||
      !input.platforms ||
      typeof input.platforms !== "object" ||
      Array.isArray(input.platforms) ||
      !Object.keys(input.platforms).length
    )
      throw new Error("Invalid updater manifest");
    metadata(input.version, input.pub_date);
    result ??= { version: input.version, pub_date: input.pub_date, platforms: {} };
    if (result.version !== input.version)
      throw new Error("Updater versions must match across platforms");
    if (Date.parse(input.pub_date) > Date.parse(result.pub_date)) result.pub_date = input.pub_date;
    for (const [key, raw] of Object.entries(input.platforms)) {
      const target = platform(key);
      if (result.platforms[target]) throw new Error("Duplicate updater platform");
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("Invalid updater platform entry");
      const entry = raw as Record<string, unknown>;
      if (
        typeof entry.url !== "string" ||
        typeof entry.signature !== "string" ||
        !entry.signature.trim() ||
        entry.signature.length > 65536
      )
        throw new Error("Invalid updater platform entry");
      result.platforms[target] = { url: httpsUrl(entry.url).href, signature: entry.signature };
    }
  }
  return result;
}

async function save(path: string, value: UpdateManifest) {
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

async function main(args: string[]) {
  if (args[0] === "--merge") {
    if (!args[1] || args.length > 3)
      throw new Error("Usage: update-manifest.ts --merge <artifact-directory> [output]");
    const directory = resolve(args[1]);
    const inputs = await files(directory, (name) =>
      /^update-(?:darwin|windows)-.*\.json$/.test(name),
    );
    const merged = mergeUpdateManifests(
      await Promise.all(inputs.map(async (path) => JSON.parse(await readFile(path, "utf8")))),
    );
    if (!merged) {
      console.log("Updater manifest skipped: no signed platform manifests were generated.");
      return;
    }
    await save(resolve(args[2] ?? join(directory, "latest.json")), merged);
    console.log(
      `Static updater manifest generated for ${Object.keys(merged.platforms).length} platforms.`,
    );
    return;
  }
  if (args.length > 2) throw new Error("Usage: update-manifest.ts [bundle-directory] [output]");
  if (!process.env.RAYPX_UPDATER_ASSET_BASE_URL) {
    console.log("Updater manifest skipped: RAYPX_UPDATER_ASSET_BASE_URL is not configured.");
    return;
  }
  const target =
    process.env.RAYPX_UPDATER_PLATFORM ?? updaterPlatform(process.platform, process.arch);
  const directory = resolve(
    args[0] ?? resolve(import.meta.dirname, "../../../../target/release/bundle"),
  );
  const output = await createUpdateManifest({
    bundleDirectory: directory,
    assetBaseUrl: process.env.RAYPX_UPDATER_ASSET_BASE_URL,
    platform: target,
    version: manifest.version,
  });
  await save(resolve(args[1] ?? join(directory, `update-${target}.json`)), output!);
  console.log(`Signed updater manifest generated for ${target}; no publication was performed.`);
}

if (import.meta.main)
  await main(process.argv.slice(2)).catch(() => {
    console.error(
      "Unable to generate a signed updater manifest. Check bundle outputs and configuration.",
    );
    process.exitCode = 1;
  });
