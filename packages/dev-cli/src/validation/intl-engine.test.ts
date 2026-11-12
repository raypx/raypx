import { expect, it } from "vite-plus/test";
import { checkIntlEngine } from "./intl-engine.js";
import { discover } from "../repository.js";
import { workspaceFixtures } from "../../tests/helpers/workspace.ts";

const { fixture, member } = workspaceFixtures();

it("accepts one engine owner and a tooling ICU validator", () => {
  const root = fixture();
  member(root, "i18n", { deps: { "use-intl": "catalog:", "intl-messageformat": "catalog:" } });
  member(root, "tooling", {
    metadata: { kind: "tooling" },
    deps: { "@formatjs/icu-messageformat-parser": "catalog:dev" },
  });
  member(root, "tasks", { deps: { "@raypx/i18n": "workspace:*" } });

  expect(checkIntlEngine(discover(root))).toEqual([]);
});

it("rejects a second engine declaration, next-intl and product FormatJS runtimes", () => {
  const root = fixture();
  member(root, "i18n", { deps: { "use-intl": "catalog:" } });
  member(root, "tasks", { extra: { devDependencies: { "use-intl": "catalog:" } } });
  member(root, "auth", { deps: { "next-intl": "^4.0.0" } });
  member(root, "blocks", { extra: { peerDependencies: { "intl-messageformat": "^11.0.0" } } });

  expect(checkIntlEngine(discover(root)).sort()).toEqual([
    "packages/auth: next-intl would install a second translation engine",
    "packages/blocks: intl-messageformat belongs to the workspace declaring use-intl",
    "use-intl must be declared by one workspace: packages/i18n, packages/tasks",
  ]);
});
