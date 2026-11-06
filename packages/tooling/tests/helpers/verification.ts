import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { taskModel } from "../../src/tasks/model";
import { workspaceFixtures } from "./workspace";

const { fixture, member } = workspaceFixtures();
export function project() {
  const root = fixture();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", packageManager: "bun@1.4.4", workspaces: ["packages/*"] }),
  );
  member(root, "tokens", { extra: { scripts: { check: "bun check.ts", test: "bun test.ts" } } });
  member(root, "bridge", {
    deps: { "@raypx/tokens": "workspace:*" },
    extra: { scripts: { check: "bun check.ts" } },
  });
  member(root, "api", {
    deps: { "@raypx/bridge": "workspace:*" },
    extra: {
      name: "api",
      scripts: { check: "bun check.ts", test: "bun test.ts", build: "bun build.ts" },
    },
  });
  member(root, "independent", {
    extra: { scripts: { check: "bun check.ts", test: "bun test.ts" } },
  });
  return { root, model: taskModel(root) };
}
/** Browser UI reaches a mixed feature's client entry; contracts and API use its universal entry. */
export function platformProject(options: { leak?: boolean; typedTest?: boolean } = {}) {
  const root = fixture();
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ name: "fixture", packageManager: "bun@1.4.4", workspaces: ["packages/*"] }),
  );
  const scripts = { check: "bun check.ts", test: "bun test.ts" };
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
    extra: { scripts, exports: { ".": "./src", "./client": "./src/client" } },
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
                "native:build": "bun native.ts",
                "native:prepare": "bun prepare.ts",
                "mygo:check": "go vet ./...",
                "mygo:test": "go test ./...",
              }
            : scripts,
      },
    });
  member(root, "cli", {
    metadata: { kind: "app", target: "bun" },
    extra: { name: "cli", scripts: { ...scripts, build: "bun build.ts" } },
  });
  return taskModel(root);
}
