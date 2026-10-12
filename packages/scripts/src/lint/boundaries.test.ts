import { describe, it } from "vite-plus/test";
import { RuleTester } from "vite-plus/lint/plugins-dev";
import { createArchitectureIndex, type ArchitectureWorkspace } from "../architecture/model.ts";
import { createBoundariesRule } from "./boundaries.ts";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const workspace = (path: string, manifest: ArchitectureWorkspace["manifest"], aliases = {}) => ({
  path,
  manifest,
  aliases,
});
const exports = { ".": "./src/index.ts" };
const index = createArchitectureIndex([
  workspace(
    "apps/web",
    {
      name: "web",
      dependencies: { "@raypx/ui": "*", "@raypx/db": "*", "@raypx/scripts": "*", desktop: "*" },
      imports: { "#db/*": "../../packages/db/src/*" },
    },
    { "@private/*": ["../../packages/*/src/index.ts"] },
  ),
  workspace(
    "apps/desktop",
    {
      name: "desktop",
      dependencies: { "@raypx/ai": "*" },
      imports: { "#native/*": "./native/*" },
    },
    { "@native/*": ["./native/*"] },
  ),
  workspace("packages/ui", {
    name: "@raypx/ui",
    exports: { "./components/ui/*": "./src/components/ui/*.tsx" },
  }),
  workspace("packages/db", {
    name: "@raypx/db",
    exports,
    devDependencies: { "@raypx/application": "*" },
  }),
  workspace("packages/application", { name: "@raypx/application", exports }),
  workspace("packages/scripts", { name: "@raypx/scripts", exports }),
  workspace("packages/ai", { name: "@raypx/ai", exports }),
]);
const tester = new RuleTester({ cwd: "/repo" });
const web = "/repo/apps/web/src/index.ts";
const desktop = "/repo/apps/desktop/src/index.ts";

tester.run(
  "raypx/boundaries",
  createBoundariesRule(() => index, "/repo"),
  {
    valid: [
      { filename: web, code: 'import "@raypx/ui/components/ui/button";' },
      { filename: web, code: 'const target = "@raypx/db"; import(target);' },
      { filename: desktop, code: 'import type { DesktopRpc } from "../native/rpc";' },
      { filename: desktop, code: 'import type { DesktopRpc } from "@native/rpc.ts";' },
      { filename: desktop, code: 'import type { DesktopRpc } from "#native/rpc.mts";' },
      {
        filename: "/repo/apps/desktop/native/main.ts",
        code: 'import "node:fs"; import "bun:ffi";',
      },
      { filename: "/repo/packages/db/src/index.test.ts", code: 'import "@raypx/application";' },
      { filename: "/repo/packages/db/tests/index.ts", code: 'import "@raypx/application";' },
      { filename: "/repo/apps/web/src/routeTree.gen.ts", code: 'import "@raypx/db";' },
      { filename: "/repo/apps/web/src/generated.d.ts", code: 'import "@raypx/db";' },
      { filename: "/repo/apps/web/src/generated.d.mts", code: 'import "@raypx/db";' },
      { filename: "/repo/vite.config.ts", code: 'import "@raypx/db";' },
    ],
    invalid: [
      {
        filename: web,
        code: 'import "@raypx/db";',
        errors: [{ message: /forbidden runtime dependency/, line: 1, column: 7 }],
      },
      {
        filename: web,
        code: 'export { value } from "@raypx/db";',
        errors: [{ message: /forbidden runtime dependency/ }],
      },
      {
        filename: web,
        code: 'export * from "@raypx/db";',
        errors: [{ message: /forbidden runtime dependency/ }],
      },
      {
        filename: web,
        code: 'const value = import("@raypx/scripts");',
        errors: [{ message: /forbidden runtime dependency/ }],
      },
      {
        filename: web,
        code: 'type Value = import("@raypx/db").Value;',
        errors: [{ message: /forbidden runtime dependency/ }],
      },
      {
        filename: web,
        code: 'import type { Value } from "@raypx/db";',
        errors: [{ message: /forbidden runtime dependency/ }],
      },
      {
        filename: web,
        code: 'import "@raypx/db/src/private";',
        errors: [{ message: /private cross-package/ }, { message: /forbidden runtime/ }],
      },
      {
        filename: web,
        code: 'export * from "../../../packages/db/src/index";',
        errors: [{ message: /private cross-package/ }, { message: /forbidden runtime/ }],
      },
      {
        filename: web,
        code: 'import "@private/db";',
        errors: [{ message: /private cross-package/ }, { message: /forbidden runtime/ }],
      },
      {
        filename: web,
        code: 'import "#db/index.ts";',
        errors: [{ message: /private cross-package/ }, { message: /forbidden runtime/ }],
      },
      {
        filename: web,
        code: 'import "desktop";',
        errors: [{ message: /private cross-package/ }, { message: /forbidden runtime/ }],
      },
      {
        filename: "/repo/packages/db/src/index.ts",
        code: 'import "@raypx/application";',
        errors: [{ message: /forbidden runtime/ }, { message: /declared production dependency/ }],
      },
      {
        filename: "/repo/apps/web/src/index.test.ts",
        code: 'import "@raypx/db/src/private";',
        errors: [{ message: /private cross-package/ }],
      },
      {
        filename: desktop,
        code: 'import "@raypx/ai";',
        errors: [{ message: /forbidden runtime/ }],
      },
      {
        filename: desktop,
        code: 'import "node:fs"; import "@earendil-works/pi-coding-agent";',
        errors: 2,
      },
      {
        filename: desktop,
        code: 'import "electrobun"; import "electrobun/main/browser-window"; import "electrobun/bun"; import "bun:ffi";',
        errors: 4,
      },
      {
        filename: desktop,
        code: 'import "../native/main";',
        errors: [{ message: /window bridge/ }],
      },
      {
        filename: desktop,
        code: 'import "@native/main.ts";',
        errors: [{ message: /window bridge/ }],
      },
      {
        filename: desktop,
        code: 'import "#native/main.ts";',
        errors: [{ message: /window bridge/ }],
      },
    ],
  },
);
