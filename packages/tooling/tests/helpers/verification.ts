import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { taskModel } from "../../src/tasks/model.ts";
import { workspaceFixtures } from "./workspace.ts";

const { fixture, member } = workspaceFixtures();
export function project() {
  const root = fixture();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", packageManager: "pnpm@12.16.1" }),
  );
  member(root, "tokens", { extra: { scripts: { check: "tsx check.ts", test: "tsx test.ts" } } });
  member(root, "bridge", {
    deps: { "@raypx/tokens": "workspace:*" },
    extra: { scripts: { check: "tsx check.ts" } },
  });
  member(root, "api", {
    deps: { "@raypx/bridge": "workspace:*" },
    extra: {
      name: "api",
      scripts: { check: "tsx check.ts", test: "tsx test.ts", build: "tsx build.ts" },
    },
  });
  member(root, "independent", {
    extra: { scripts: { check: "tsx check.ts", test: "tsx test.ts" } },
  });
  return { root, model: taskModel(root) };
}
/** Browser UI reaches a mixed feature's client entry; contracts and API use its universal entry. */
export function platformProject(options: { leak?: boolean; typedTest?: boolean } = {}) {
  const root = fixture();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", packageManager: "pnpm@12.16.1" }),
  );
  const scripts = { check: "tsx check.ts", test: "tsx test.ts" };
  member(root, "ui", { metadata: { kind: "library", target: "browser" }, extra: { scripts } });
  const feature = member(root, "feature", {
    metadata: {
      kind: "library",
      target: "universal",
      entryTargets: { "./client": "browser" },
      sourceTargets: { "src/client.ts": "browser" },
    },
    deps: { "@raypx/ui": "workspace:*" },
    ...(options.leak
      ? {
          source:
            'import type { view } from "./client";\nexport type View = typeof view;\nexport const answer = 42;',
        }
      : {}),
    extra: { scripts, exports: { ".": "./src/index.ts", "./client": "./src/client.ts" } },
  });
  writeFileSync(
    join(root, feature, "src/client.ts"),
    'import { answer } from "@raypx/ui";\nexport const view = answer;',
  );
  const contracts = member(root, "contracts", {
    deps: { "@raypx/feature": "workspace:*" },
    source: 'export { answer } from "@raypx/feature";',
    extra: { scripts },
  });
  if (options.typedTest) {
    mkdirSync(join(root, contracts, "tests"));
    writeFileSync(
      join(root, contracts, "tests/view.test.ts"),
      'import type { view } from "@raypx/feature/client";\nexport type View = typeof view;',
    );
  }
  member(root, "api", {
    metadata: { kind: "app", target: "node" },
    deps: { "@raypx/contracts": "workspace:*" },
    extra: { name: "api", scripts },
  });
  for (const name of ["web", "desktop"])
    member(root, name, {
      metadata: {
        kind: "app",
        target: "browser",
        ...(name === "desktop" ? { sourceTargets: { "bridge.ts": "universal" } } : {}),
      },
      deps: { "@raypx/ui": "workspace:*", "@raypx/feature": "workspace:*" },
      extra: {
        name,
        scripts:
          name === "desktop"
            ? {
                ...scripts,
                "native:build": "tsx native.ts",
                "native:prepare": "tsx prepare.ts",
                "tauri:check": "cargo check",
                "tauri:test": "cargo test",
              }
            : scripts,
      },
    });
  member(root, "cli", {
    metadata: { kind: "app", target: "node" },
    extra: { name: "cli", scripts: { ...scripts, build: "tsx build.ts" } },
  });
  return taskModel(root);
}
