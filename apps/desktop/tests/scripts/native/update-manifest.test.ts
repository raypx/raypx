import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, expect, it } from "vite-plus/test";
import {
  createUpdateManifest,
  mergeUpdateManifests,
  updaterPlatform,
} from "../../../scripts/native/update-manifest";

const roots: string[] = [];
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), "raypx-update-manifest-"));
  roots.push(directory);
  const write = (path: string, content = "archive") => {
    const file = join(directory, path);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, content);
    return file;
  };
  return { directory, write };
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

const options = {
  assetBaseUrl: "https://downloads.example.test/desktop/v1.2.3",
  version: "1.2.3",
  platform: "darwin-aarch64",
  pubDate: "2026-10-27T00:00:00.000Z",
};

it("skips manifest generation without an asset URL, even before bundles exist", async () => {
  expect(
    await createUpdateManifest({
      ...options,
      assetBaseUrl: undefined,
      bundleDirectory: "/does-not-exist",
    }),
  ).toBeUndefined();
});

it("uses the actual macOS updater archive and signature, retaining relative paths and encoding names", async () => {
  const f = fixture();
  f.write("macos/Raypx 1.2.3.app.tar.gz");
  f.write("macos/Raypx 1.2.3.app.tar.gz.sig", " actual-public-signature\n");
  f.write("dmg/Raypx_1.2.3_aarch64.dmg");
  f.write("macos/Raypx.app/Contents/Resources/ignored.app.tar.gz");
  expect(await createUpdateManifest({ ...options, bundleDirectory: f.directory })).toEqual({
    version: "1.2.3",
    pub_date: options.pubDate,
    platforms: {
      "darwin-aarch64": {
        url: "https://downloads.example.test/desktop/v1.2.3/macos/Raypx%201.2.3.app.tar.gz",
        signature: "actual-public-signature",
      },
    },
  });
});

it("uses the actual NSIS filename instead of an inferred Windows artifact name", async () => {
  const f = fixture();
  f.write("nsis/Raypx_1.2.3_x64-setup.exe");
  f.write("nsis/Raypx_1.2.3_x64-setup.exe.sig", "windows-signature");
  f.write("msi/ignored.msi");
  const result = await createUpdateManifest({
    ...options,
    bundleDirectory: f.directory,
    platform: "windows-x86_64",
  });
  expect(result?.platforms["windows-x86_64"]).toEqual({
    url: "https://downloads.example.test/desktop/v1.2.3/nsis/Raypx_1.2.3_x64-setup.exe",
    signature: "windows-signature",
  });
});

it.each([
  "http://downloads.example.test/",
  "https://user:secret@downloads.example.test/",
  "https://downloads.example.test/?credential=secret",
  "https://downloads.example.test/#fragment",
  "not-a-url",
])("rejects an unsafe asset prefix", async (assetBaseUrl) => {
  await expect(
    createUpdateManifest({ ...options, assetBaseUrl, bundleDirectory: "/unused" }),
  ).rejects.toThrow(/HTTPS/);
});

it("requires exactly one updater archive to prevent stale bundles entering a release", async () => {
  const f = fixture();
  await expect(createUpdateManifest({ ...options, bundleDirectory: f.directory })).rejects.toThrow(
    "exactly one",
  );
  f.write("macos/first.app.tar.gz");
  f.write("macos/first.app.tar.gz.sig", "first-signature");
  f.write("macos/stale.app.tar.gz");
  f.write("macos/stale.app.tar.gz.sig", "stale-signature");
  await expect(createUpdateManifest({ ...options, bundleDirectory: f.directory })).rejects.toThrow(
    "exactly one",
  );
});

it.each([undefined, "", "x".repeat(65537)])(
  "refuses missing, empty or oversized signatures",
  async (signature) => {
    const f = fixture();
    f.write("macos/Raypx.app.tar.gz");
    if (signature !== undefined) f.write("macos/Raypx.app.tar.gz.sig", signature);
    await expect(
      createUpdateManifest({ ...options, bundleDirectory: f.directory }),
    ).rejects.toThrow(/signature/);
  },
);

it.each([
  ["darwin", "arm64", "darwin-aarch64"],
  ["darwin", "x64", "darwin-x86_64"],
  ["win32", "arm64", "windows-aarch64"],
  ["win32", "x64", "windows-x86_64"],
])("maps %s/%s to the updater platform", (os, arch, expected) => {
  expect(updaterPlatform(os, arch)).toBe(expected);
});

it("keeps Linux updater distribution unsupported", () => {
  expect(() => updaterPlatform("linux", "x64")).toThrow("Unsupported updater platform");
});

const partial = (target: string, version = "1.2.3") => ({
  version,
  pub_date: options.pubDate,
  platforms: {
    [target]: { url: `https://downloads.example.test/${target}/actual-file`, signature: target },
  },
});

it("merges platform manifests only when versions and targets are consistent", () => {
  const windows = { ...partial("windows-x86_64"), pub_date: "2026-10-27T01:00:00.000Z" };
  expect(mergeUpdateManifests([partial("darwin-aarch64"), windows])).toEqual({
    version: "1.2.3",
    pub_date: windows.pub_date,
    platforms: { ...partial("darwin-aarch64").platforms, ...windows.platforms },
  });
  expect(mergeUpdateManifests([])).toBeUndefined();
  expect(() =>
    mergeUpdateManifests([partial("darwin-aarch64"), partial("darwin-aarch64")]),
  ).toThrow("Duplicate updater platform");
  expect(() =>
    mergeUpdateManifests([partial("darwin-aarch64"), partial("windows-x86_64", "9.0.0")]),
  ).toThrow("versions must match");
});

it("rejects malformed or insecure platform manifests before saving a combined feed", () => {
  for (const input of [
    null,
    { version: "1.2.3", pub_date: options.pubDate, platforms: {} },
    partial("linux-x86_64"),
    { ...partial("windows-x86_64"), version: "invalid" },
    { ...partial("windows-x86_64"), pub_date: "invalid" },
    {
      ...partial("windows-x86_64"),
      platforms: { "windows-x86_64": { url: "http://example.test/file", signature: "signed" } },
    },
  ])
    expect(() => mergeUpdateManifests([input])).toThrow(/updater|HTTPS/);
});

it("combines downloaded platform artifacts into a reviewable static feed without signing keys", () => {
  const f = fixture();
  f.write("desktop-macOS/update-darwin-aarch64.json", JSON.stringify(partial("darwin-aarch64")));
  f.write("desktop-Windows/update-windows-x86_64.json", JSON.stringify(partial("windows-x86_64")));
  const script = resolve(import.meta.dirname, "../../../scripts/native/update-manifest.ts");
  const result = spawnSync(process.execPath, [script, "--merge", f.directory], {
    env: { ...process.env, TAURI_SIGNING_PRIVATE_KEY: "", RAYPX_UPDATER_ASSET_BASE_URL: "" },
    encoding: "utf8",
    timeout: 10000,
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("2 platforms");
  expect(JSON.parse(readFileSync(join(f.directory, "latest.json"), "utf8"))).toEqual(
    mergeUpdateManifests([partial("darwin-aarch64"), partial("windows-x86_64")]),
  );
});

it("reports an unconfigured asset prefix without creating an updater feed", () => {
  const f = fixture();
  const script = resolve(import.meta.dirname, "../../../scripts/native/update-manifest.ts");
  const result = spawnSync(process.execPath, [script, f.directory], {
    env: { ...process.env, RAYPX_UPDATER_ASSET_BASE_URL: "" },
    encoding: "utf8",
    timeout: 10000,
  });
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("RAYPX_UPDATER_ASSET_BASE_URL is not configured");
  expect(existsSync(join(f.directory, "latest.json"))).toBe(false);
});
