import { copyFileSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { workspaceFixtures } from "./workspace.ts";
import { project } from "./cache.ts";

const { member } = workspaceFixtures();
const repository = resolve(import.meta.dirname, "../../../..");
const configUrl = pathToFileURL(join(repository, "packages/tooling/src/tasks/config.ts")).href;

export function validationProject() {
  const root = project();
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  manifest.devEngines = {
    packageManager: { name: "pnpm", version: "12.16.1", onFail: "error" },
    runtime: { name: "node", version: ">=24.18.0 <25", onFail: "error" },
  };
  manifest.engines = { node: ">=24.18.0 <25" };
  writeFileSync(join(root, "package.json"), JSON.stringify(manifest));
  writeFileSync(join(root, "rust-toolchain.toml"), '[toolchain]\nchannel="1.99.1"\n');
  writeFileSync(
    join(root, "mise.toml"),
    '[settings]\nidiomatic_version_file_enable_tools = ["node"]\n',
  );
  writeFileSync(
    join(root, "vite.config.ts"),
    `import { repositoryTaskConfig } from ${JSON.stringify(configUrl)}; export default repositoryTaskConfig(import.meta.url);`,
  );
  const tooling = join(root, "packages/tooling");
  const toolingManifest = JSON.parse(readFileSync(join(tooling, "package.json"), "utf8"));
  toolingManifest.dependencies = {
    "@raypx-kit/devkit": "1.0.0",
    "@raypx-kit/intl": "1.0.0",
    "@raypx/runtime-node": "1.0.0",
    confbox: "1.0.0",
    semver: "1.0.0",
  };
  writeFileSync(join(tooling, "package.json"), JSON.stringify(toolingManifest));
  symlinkSync(
    join(repository, "packages/tooling/node_modules/@raypx-kit/intl"),
    join(root, "node_modules/@raypx-kit/intl"),
    "dir",
  );
  for (const file of [
    "policy.ts",
    "validation/toolchain.ts",
    "validation/workspaces.ts",
    "validation/source-layers.ts",
    "validation/entries.ts",
    "validation/deployment.ts",
    "build/deployment.ts",
    "verification/prechecks.ts",
  ]) {
    mkdirSync(join(tooling, "src", file, ".."), { recursive: true });
    copyFileSync(join(repository, "packages/tooling/src", file), join(tooling, "src", file));
  }
  writeFileSync(
    join(tooling, "src/repository.ts"),
    'import { discover as read } from "@raypx-kit/devkit/workspaces"; export const discover = (root: string) => read(root, { metadataKey: "raypx" });',
  );
  writeFileSync(
    join(tooling, "src/cli.ts"),
    'import { runPrecheck } from "./verification/prechecks.ts"; runPrecheck(process.cwd(), process.argv[3] ?? "");',
  );
  // Fixture workspaces model a repository snapshot, not a product graph: their
  // entries exist so policy has something to inspect, not for an importer.
  const scaffold = (entries: Record<string, string>) => ({
    kind: "library",
    target: "universal",
    entryConsumers: entries,
  });
  const i18n = member(root, "i18n", {
    extra: {
      exports: { "./config": "./src/config.ts" },
      raypx: scaffold({ "./config": "read by the fixture precheck" }),
    },
  });
  writeFileSync(
    join(root, i18n, "src/config.ts"),
    'export default { locales: { en: "English", zh: "中文" }, defaultLocale: "en" };',
  );
  const feature = member(root, "feature", {
    extra: { raypx: scaffold({ ".": "fixture workspace" }) },
  });
  mkdirSync(join(root, feature, "src/messages"));
  for (const locale of ["en", "zh"])
    writeFileSync(
      join(root, feature, `src/messages/${locale}.ts`),
      'export default { label: "Label" };',
    );
  for (const path of ["packages/tooling", i18n, feature])
    writeFileSync(join(root, path, "AGENTS.md"), "Fixture instructions.\n");
  return root;
}
