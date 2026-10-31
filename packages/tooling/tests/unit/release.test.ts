import { afterEach, expect, it, vi } from "vite-plus/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBuiltRelease, resolveRelease } from "../../src/build/release.js";
import { analyticsBuild } from "../../src/build/analytics.js";

afterEach(() => vi.unstubAllEnvs());
it("resolves explicit, Railway and verification identities without inventing a production release", () => {
  const root = mkdtempSync(join(tmpdir(), "raypx-release-"));
  try {
    expect(
      resolveRelease(root, { VITE_APP_RELEASE: "explicit", RAILWAY_GIT_COMMIT_SHA: "commit" }),
    ).toBe("explicit");
    expect(resolveRelease(root, { RAILWAY_GIT_COMMIT_SHA: "commit" })).toBe("commit");
    expect(resolveRelease(root, {}, "verification")).toBe("verification");
    expect(resolveRelease(root, {}, "development")).toBe("development");
    expect(() => resolveRelease(root, {})).toThrow("outside a Git checkout");
    expect(() => resolveRelease(root, { VITE_APP_RELEASE: "bad\nrelease" })).toThrow("Invalid");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("rejects invalid recorded releases rather than inferring them from the upload checkout", () => {
  const root = mkdtempSync(join(tmpdir(), "raypx-recorded-release-"));
  try {
    for (const release of ["", "  ", "invalid\nrelease"]) {
      writeFileSync(
        join(root, "raypx-release.json"),
        JSON.stringify({ version: 1, surface: "web", release }),
      );
      expect(() => readBuiltRelease(root, "web")).toThrow("Invalid application release");
    }
    expect(() => readBuiltRelease(root, "desktop")).toThrow("requested target");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it("emits only public client metadata matching the release embedded in JavaScript", () => {
  vi.stubEnv("VITE_APP_RELEASE", "built-commit");
  vi.stubEnv("POSTHOG_CLI_API_KEY", "private-value");
  const config = analyticsBuild("web");
  const emitFile = vi.fn((_asset: { source: string; fileName: string }) => "asset");
  config.plugin.generateBundle.call({ environment: { name: "ssr" }, emitFile });
  expect(emitFile).not.toHaveBeenCalled();
  config.plugin.generateBundle.call({ environment: { name: "client" }, emitFile });
  const asset = emitFile.mock.calls[0]![0];
  expect(asset.fileName).toBe("assets/raypx-release.json");
  expect(JSON.parse(asset.source)).toEqual({
    version: 1,
    surface: "web",
    release: JSON.parse(config.define["import.meta.env.VITE_APP_RELEASE"]),
  });
  expect(asset.source).not.toContain("private-value");
});
