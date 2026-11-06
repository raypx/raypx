import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vite-plus/test";
import { workspaceFixtures } from "../../tests/helpers/workspace.ts";
import { packageCliRuntime } from "./cli.ts";

vi.mock("@raypx/runtime-node/process", () => ({
  spawnProcess: vi.fn(() => ({ exited: Promise.resolve(0) })),
}));

const { fixture } = workspaceFixtures();

it("packages the actual supported Node version instead of the version range", async () => {
  const root = fixture();
  writeFileSync(join(root, "package.json"), JSON.stringify({ engines: { node: ">=24.18.0 <25" } }));
  mkdirSync(join(root, "apps/cli"), { recursive: true });
  writeFileSync(join(root, "apps/cli/package.json"), JSON.stringify({ version: "1.0.0" }));
  writeFileSync(join(root, "LICENSE"), "Raypx license");
  const runtime = join(
    root,
    ".cache/runtime",
    `${process.platform}-${process.arch}-node${process.versions.node}`,
    "runtime",
  );
  mkdirSync(runtime, { recursive: true });
  const suffix = process.platform === "win32" ? ".exe" : "";
  writeFileSync(join(runtime, "node" + suffix), "cached Node binary");
  writeFileSync(join(runtime, "NODE-LICENSE"), "Node license");
  mkdirSync(join(root, "target/release"), { recursive: true });
  writeFileSync(join(root, "target/release/raypx" + suffix), "launcher");
  const output = join(root, "apps/cli/dist");
  mkdirSync(output);
  await packageCliRuntime(root, output, 1234);
  const manifest = JSON.parse(readFileSync(join(output, "runtime.json"), "utf8"));
  expect(manifest.nodeVersion).toBe(process.versions.node);
  expect(manifest.builtAt).toBe(1234);
  expect(readFileSync(join(output, "runtime/node" + suffix), "utf8")).toBe("cached Node binary");
});
