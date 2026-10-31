import { afterEach, expect, it, vi } from "vite-plus/test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { uploadAnalyticsMaps } from "../../src/analytics.js";
const mocks = vi.hoisted(() => ({ run: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@raypx-kit/devkit/process", () => ({ run: mocks.run }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});
it("requires explicit upload credentials before touching release assets", async () => {
  for (const key of ["POSTHOG_CLI_HOST", "POSTHOG_CLI_PROJECT_ID", "POSTHOG_CLI_API_KEY"])
    vi.stubEnv(key, undefined);
  await expect(uploadAnalyticsMaps("/missing", "unknown")).rejects.toThrow("Usage");
  await expect(uploadAnalyticsMaps("/missing", "web")).rejects.toThrow("release environment");
  expect(mocks.run).not.toHaveBeenCalled();
});
it("injects and uploads the same client assets under one release and deletes maps only on upload", async () => {
  const root = mkdtempSync(join(tmpdir(), "raypx-analytics-release-"));
  try {
    for (const key of ["POSTHOG_CLI_HOST", "POSTHOG_CLI_PROJECT_ID", "POSTHOG_CLI_API_KEY"])
      vi.stubEnv(key, "synthetic");
    vi.stubEnv("VITE_APP_RELEASE", undefined);
    const directory = join(root, "apps/desktop/dist/client/assets");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "app.js.map"), "{}");
    writeFileSync(
      join(directory, "raypx-release.json"),
      JSON.stringify({ version: 1, surface: "desktop", release: "test-release" }),
    );
    await uploadAnalyticsMaps(root, "desktop");
    expect(
      mocks.run.mock.calls.map(([binary, args, cwd]) => {
        expect(binary).toBe(process.execPath);
        expect(args[0]).toMatch(/run-posthog-cli\.js$/);
        return [args.slice(1), cwd];
      }),
    ).toEqual([
      [
        [
          "sourcemap",
          "inject",
          "--directory",
          directory,
          "--release-name",
          "raypx-desktop",
          "--release-version",
          "test-release",
        ],
        root,
      ],
      [
        [
          "sourcemap",
          "upload",
          "--directory",
          directory,
          "--release-name",
          "raypx-desktop",
          "--release-version",
          "test-release",
          "--delete-after",
        ],
        root,
      ],
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("rejects a release override that differs from the built assets before modifying them", async () => {
  const root = mkdtempSync(join(tmpdir(), "raypx-analytics-mismatch-"));
  try {
    for (const key of ["POSTHOG_CLI_HOST", "POSTHOG_CLI_PROJECT_ID", "POSTHOG_CLI_API_KEY"])
      vi.stubEnv(key, "synthetic");
    vi.stubEnv("VITE_APP_RELEASE", "other-checkout");
    const directory = join(root, "apps/web/.output/public/assets");
    mkdirSync(directory, { recursive: true });
    writeFileSync(join(directory, "app.js.map"), "{}");
    await expect(uploadAnalyticsMaps(root, "web")).rejects.toThrow("metadata is missing");
    writeFileSync(
      join(directory, "raypx-release.json"),
      JSON.stringify({ version: 1, surface: "web", release: "built-version" }),
    );
    await expect(uploadAnalyticsMaps(root, "web")).rejects.toThrow("differs from the built assets");
    expect(mocks.run).not.toHaveBeenCalled();
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
