import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import { clean, cleanArtifacts, cleanRust } from "../../src/clean.js";
import { workspaceFixtures } from "../helpers/workspace.js";

const { fixture, member } = workspaceFixtures();
const mocks = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock("@raypx-kit/devkit/process", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@raypx-kit/devkit/process")>()),
  run: mocks.run,
}));
beforeEach(() => vi.stubEnv("CARGO_TARGET_DIR", undefined));
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});

it("cleans generated files while preserving source, dependencies and local data on repeated runs", async () => {
  const root = fixture();
  const library = member(root, "feature");
  const outputs = [
    `${library}/dist/index.js`,
    `${library}/coverage/lcov.info`,
    `${library}/.turbo/check.log`,
    ".turbo/cache/task.tar.zst",
    "node_modules/.vite/task-cache/task.json",
    "node_modules/.vitest-cache/module.bin",
    `${library}/node_modules/.vite/vitest/results.json`,
    `${library}/node_modules/.cache/raypx-tests/run.json`,
    "node_modules/.cache/raypx-tests/run.json",
    ".artifacts/probe/cache/task.tar.zst",
    "apps/desktop/artifacts/browser/client/index.html",
    "apps/desktop/src-tauri/binaries/raypx-aarch64-apple-darwin",
    "apps/desktop/src-tauri/gen/schemas/desktop-schema.json",
    "e2e/test-results/screenshot.png",
    "e2e/playwright-report/index.html",
  ];
  const preserved = [
    `${library}/src/index.ts`,
    `${library}/build/source.ts`,
    `${library}/artifacts/fixture.json`,
    `${library}/node_modules/dependency/index.js`,
    "node_modules/.bun/package/index.js",
    "bun.lock",
    "Cargo.lock",
    "Cargo.toml",
    "rust-toolchain.toml",
    "target/debug/deps/libdependency.rlib",
    "target/release/bundle/macos/Raypx.app/Contents/MacOS/Raypx",
    "crates/raypx-core/src/lib.rs",
    ".git/config",
    ".env.local",
    "data/profile.sqlite",
    "apps/desktop/src-tauri/src/main.rs",
    "apps/desktop/src-tauri/tauri.conf.json",
    "apps/desktop/src-tauri/icons/icon.png",
    "packages/tooling/src/validation/inventory.ts",
    "compose.yaml",
  ];
  for (const path of [...outputs, ...preserved]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), path);
  }

  await clean(root);
  await clean(root);

  for (const path of outputs) expect(existsSync(join(root, path))).toBe(false);
  for (const path of preserved) expect(readFileSync(join(root, path), "utf8")).toBe(path);
  expect(mocks.run).toHaveBeenCalledTimes(2);
  expect(mocks.run).toHaveBeenCalledWith(
    "cargo",
    ["clean", "--workspace", "--profile", "dev", "--locked", "--offline"],
    root,
  );
});

it("cleans reports independently while preserving built applications, sidecars and validation tools", async () => {
  const root = fixture();
  const library = member(root, "feature");
  const outputs = [
    ".artifacts/tests/run/inventory.json",
    `${library}/.artifacts/probe/result.json`,
    "node_modules/.cache/raypx-tests/run.json",
    `${library}/node_modules/.cache/raypx-tests/run.json`,
    `${library}/coverage/lcov.info`,
    "e2e/test-results/trace.zip",
    "e2e/playwright-report/index.html",
  ];
  const preserved = [
    `${library}/dist/index.js`,
    `${library}/node_modules/.vite/task-cache/task.json`,
    "apps/desktop/src-tauri/binaries/raypx-aarch64-apple-darwin",
    "target/release/bundle/dmg/Raypx.dmg",
    "packages/tooling/src/validation/inventory.ts",
    "data/profile.sqlite",
    "bun.lock",
    "target/debug/libraypx_core.rlib",
    "Cargo.lock",
    "Cargo.toml",
  ];
  for (const path of [...outputs, ...preserved]) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), path);
  }
  await cleanArtifacts(root);
  await cleanArtifacts(root);
  for (const path of outputs) expect(existsSync(join(root, path))).toBe(false);
  for (const path of preserved) expect(readFileSync(join(root, path), "utf8")).toBe(path);
  expect(mocks.run).not.toHaveBeenCalled();
});

it("does not require Cargo before Rust artifacts exist or in a Bun-only repository", async () => {
  const root = fixture();
  writeFileSync(join(root, "Cargo.toml"), "manifest");
  await cleanRust(root);
  mkdirSync(join(root, "target"));
  await cleanRust(root);
  const bunOnly = fixture();
  mkdirSync(join(bunOnly, "target"));
  await cleanRust(bunOnly);
  expect(mocks.run).not.toHaveBeenCalled();
});

it("honors CARGO_TARGET_DIR without cleaning JavaScript outputs", async () => {
  const root = fixture();
  const library = member(root, "feature");
  writeFileSync(join(root, "Cargo.toml"), "manifest");
  mkdirSync(join(root, "cargo-cache"));
  writeFileSync(join(root, "cargo-cache/.rustc_info.json"), "{}");
  mkdirSync(join(root, library, "dist"));
  const output = join(root, library, "dist/index.js");
  writeFileSync(output, "built JavaScript");
  vi.stubEnv("CARGO_TARGET_DIR", "cargo-cache");
  await cleanRust(root);
  expect(mocks.run).toHaveBeenCalledOnce();
  expect(readFileSync(output, "utf8")).toBe("built JavaScript");
});

it("propagates Cargo failures before removing application outputs", async () => {
  const root = fixture();
  const library = member(root, "feature");
  writeFileSync(join(root, "Cargo.toml"), "manifest");
  mkdirSync(join(root, "target"));
  writeFileSync(join(root, "target/.rustc_info.json"), "{}");
  mkdirSync(join(root, library, "dist"));
  const output = join(root, library, "dist/index.js");
  writeFileSync(output, "built JavaScript");
  mocks.run.mockRejectedValueOnce(new Error("Cargo unavailable"));
  await expect(clean(root)).rejects.toThrow("Cargo unavailable");
  expect(readFileSync(output, "utf8")).toBe("built JavaScript");
});
