import { mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { workspaceFixtures } from "../../tests/helpers/workspace.ts";
import { collectBuildSizes, reportBuildSizes, sizeOptions } from "./build-size.ts";

const { fixture, member } = workspaceFixtures();
afterEach(() => vi.restoreAllMocks());

function file(root: string, path: string, content: string | Buffer) {
  const parts = path.split("/");
  mkdirSync(join(root, ...parts.slice(0, -1)), { recursive: true });
  writeFileSync(join(root, path), content);
}

function buildMember(root: string, name: string) {
  return member(root, name, { extra: { scripts: { build: "vp build" } } });
}

it("discovers build packages, counts exact file bytes and prefers deployable Nitro outputs", () => {
  const root = fixture();
  const service = buildMember(root, "arbitrary-service");
  const library = buildMember(root, "compiled-library");
  buildMember(root, "not-built");
  member(root, "source-only");
  file(root, `${service}/dist/intermediate.mjs`, "intermediate output");
  file(root, `${service}/.output/server/index.mjs`, "你好");
  file(root, `${service}/.output/server/index.mjs.map`, "{}");
  file(root, `${service}/.output/LICENSE`, "license");
  file(root, `${library}/dist/index.js`, "export {};");
  const report = collectBuildSizes(root, { packages: [] });
  expect(report.artifacts).toHaveLength(3);
  expect(
    report.artifacts.find((item) => item.workspace === "@raypx/arbitrary-service"),
  ).toMatchObject({ path: `${service}/.output`, bytes: 15, files: 3, status: "measured" });
  expect(report.artifacts.find((item) => item.workspace === "@raypx/not-built")).toMatchObject({
    status: "missing",
  });
  expect(
    collectBuildSizes(root, { packages: [library, "@raypx/compiled-library"] }).artifacts,
  ).toHaveLength(1);
  expect(() => collectBuildSizes(root, { packages: ["source-only"] })).toThrow("build package");
});

it("partitions the full CLI payload without dropping or double-counting runtime bytes", () => {
  const root = fixture();
  const cli = buildMember(root, "command");
  file(root, `${cli}/dist/runtime.json`, "{}");
  file(root, `${cli}/dist/raypx.exe`, Buffer.alloc(5));
  file(root, `${cli}/dist/LICENSE`, Buffer.alloc(2));
  file(root, `${cli}/dist/herdr/herdr.exe`, Buffer.alloc(3));
  const [artifact] = collectBuildSizes(root, { packages: ["command"] }).artifacts;
  expect(artifact).toMatchObject({ bytes: 12, files: 4 });
  expect(artifact!.components).toEqual(
    expect.arrayContaining([
      { name: "CLI / embedded Bun", bytes: 5, files: 1 },
      { name: "Herdr", bytes: 3, files: 1 },
      { name: "Metadata / licenses", bytes: 4, files: 2 },
    ]),
  );
});

it("does not follow directory links into external dependencies or cycles", () => {
  const root = fixture();
  const app = buildMember(root, "linked");
  file(root, `${app}/dist/index.js`, "123");
  file(root, "external/secret.txt", "must not be counted");
  symlinkSync(join(root, "external"), join(root, app, "dist/external"), "junction");
  symlinkSync(join(root, app, "dist"), join(root, app, "dist/cycle"), "junction");
  expect(collectBuildSizes(root, { packages: [] }).artifacts[0]).toMatchObject({
    bytes: 3,
    files: 1,
    symlinks: 2,
  });
});

it("separates the configured renderer, browser fixture, app bundle and compressed installers", () => {
  const root = fixture();
  const app = buildMember(root, "native-app");
  file(root, `${app}/mygo.config.ts`, "export default {};");
  file(root, `${app}/dist/client/index.html`, "123");
  file(root, `${app}/dist/server/unused.js`, "not in the native renderer");
  file(root, `${app}/artifacts/browser/client/index.html`, "1234");
  file(root, `${app}/build/metadata.json`, "{}");
  expect(collectBuildSizes(root, { packages: [app], native: true }).artifacts[1]).toMatchObject({
    kind: "native",
    status: "missing",
  });
  file(root, `${app}/build/darwin-arm64/Workbench.app/Contents/MacOS/app`, Buffer.alloc(20));
  file(root, `${app}/build/darwin-arm64/Workbench.dmg`, Buffer.alloc(10));
  file(root, `${app}/build/windows-amd64/Workbench-setup.exe`, Buffer.alloc(9));
  file(root, `${app}/build/windows-amd64/Workbench-setup.exe.sig`, "signature");
  file(root, `${app}/build/native-smoke/windows-amd64/smoke.exe`, Buffer.alloc(99));
  const report = collectBuildSizes(root, { packages: [app], native: true });
  expect(report.artifacts).toHaveLength(4);
  expect(report.artifacts.map((item) => item.bytes).sort((a, b) => a - b)).toEqual([3, 9, 10, 20]);
  expect(collectBuildSizes(root, { packages: [app], browser: true }).artifacts[0]?.bytes).toBe(4);
});

it("writes machine-readable evidence and the CI summary, rejecting missing required artifacts", () => {
  const root = fixture();
  buildMember(root, "absent");
  const summary = join(root, "summary.md");
  vi.stubEnv("GITHUB_STEP_SUMMARY", summary);
  vi.spyOn(console, "log").mockImplementation(() => {});
  expect(() => reportBuildSizes(root, { packages: ["absent"], required: true })).toThrow(
    "unavailable",
  );
  const [run] = readdirSync(join(root, ".artifacts/sizes"));
  const report = JSON.parse(
    readFileSync(join(root, ".artifacts/sizes", run!, "sizes.json"), "utf8"),
  );
  expect(report.artifacts[0].status).toBe("missing");
  expect(readFileSync(summary, "utf8")).toContain("Unavailable");
  expect(sizeOptions(["--package", "absent", "--native", "--require"])).toEqual({
    packages: ["absent"],
    native: true,
    required: true,
  });
  expect(() => sizeOptions(["--package", "--native"])).toThrow("Usage");
});
