import { describe, expect, it } from "vite-plus/test";
import { checkArchitecture } from "./architecture.js";
function fixture(
  entries: Record<
    string,
    {
      deps?: string[];
      dev?: string[];
      source?: string;
      exports?: Record<string, string>;
      paths?: Record<string, string[]>;
      imports?: Record<string, string>;
      sources?: Record<string, string>;
    }
  >,
) {
  const files: Record<string, string> = {};
  const names = new Map(
    Object.keys(entries).map((path) => {
      const name = path.split("/").at(-1)!;
      return [name, path.startsWith("apps/") ? name : `@raypx/${name}`] as const;
    }),
  );
  for (const [path, item] of Object.entries(entries)) {
    files[`${path}/package.json`] = JSON.stringify({
      name: names.get(path.split("/").at(-1)!),
      dependencies: Object.fromEntries(
        (item.deps ?? []).map((n) => [names.get(n) ?? `@raypx/${n}`, "workspace:*"]),
      ),
      devDependencies: Object.fromEntries(
        (item.dev ?? []).map((n) => [names.get(n) ?? `@raypx/${n}`, "workspace:*"]),
      ),
      exports: item.exports ?? { ".": "./src/index.ts" },
      ...(item.imports ? { imports: item.imports } : {}),
    });
    if (item.source) files[`${path}/src/index.ts`] = item.source;
    for (const [name, source] of Object.entries(item.sources ?? {}))
      files[`${path}/${name}`] = source;
    if (item.paths)
      files[`${path}/tsconfig.json`] = JSON.stringify({ compilerOptions: { paths: item.paths } });
  }
  return checkArchitecture(
    {
      repositoryRoot: "/repo",
      readFile: async (path) => files[path.slice(6)]!,
      pathExists: async (path) => path.slice(6) in files,
    },
    Object.keys(entries),
    Object.keys(files),
  );
}
describe("architecture policy", () => {
  it("rejects reversed production edges and dependency cycles", async () => {
    const findings = await fixture({
      "packages/core": { deps: ["application"] },
      "packages/application": { deps: ["core"] },
    });
    expect(findings.some((finding) => finding.message.includes("must not depend"))).toBe(true);
    expect(findings.some((finding) => finding.message.includes("cycle:"))).toBe(true);
  });
  it("rejects imports between apps in manifests", async () => {
    expect(
      (await fixture({ "apps/web": { deps: ["desktop"] }, "apps/desktop": {} })).some((finding) =>
        finding.message.includes("must not depend"),
      ),
    ).toBe(true);
  });
  it("allows test-only reverse dependencies in manifests", async () => {
    expect(
      await fixture({
        "packages/db": { deps: ["core"], dev: ["application"] },
        "packages/core": {},
        "packages/application": { deps: ["core"] },
      }),
    ).toEqual([]);
  });
  it("leaves individual source diagnostics to Oxlint", async () => {
    expect(
      await fixture({
        "apps/desktop": {
          source: 'import "node:fs"; import "../native/main"; import "@raypx/ai";',
        },
        "packages/ai": {},
      }),
    ).toEqual([]);
  });
  it.each([
    'import "@raypx/db";',
    'export * from "../../db/src/index";',
    'const value = import("@raypx/db");',
    'type Value = import("@raypx/db").Value;',
    'import "@db";',
    'import "#db";',
  ])("retains undeclared source edges in the complete graph: %s", async (source) => {
    const findings = await fixture({
      "packages/core": {
        source,
        paths: { "@db": ["../db/src/index.ts"] },
        imports: { "#db": "../db/src/index.ts" },
      },
      "packages/db": { deps: ["core"] },
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("cycle:");
  });
  it("keeps generated, declaration and test imports out of the runtime graph", async () => {
    expect(
      await fixture({
        "packages/core": {
          sources: {
            "src/index.test.ts": 'import "@raypx/db";',
            "tests/index.ts": 'import "@raypx/db";',
            "src/routeTree.gen.ts": 'import "@raypx/db";',
            "src/index.d.ts": 'import "@raypx/db";',
          },
        },
        "packages/db": { deps: ["core"] },
      }),
    ).toEqual([]);
  });
  it("rejects transport ownership in the UI manifest", async () => {
    const findings = await fixture({
      "apps/web": { deps: ["agent-ui"] },
      "packages/agent-ui": { deps: ["ui", "contracts", "client"] },
      "packages/ui": {},
      "packages/contracts": {},
      "packages/client": {},
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]?.message).toContain("must not depend on @raypx/client");
  });
});
