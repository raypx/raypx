import { expect, it } from "vite-plus/test";
import { imports } from "@raypx-kit/devkit/architecture";
import { layerViolations, type SourceNode } from "./source-layers.js";

it("blocks infrastructure hidden behind a barrel or dynamic import while allowing injected ports", () => {
  const entry = "apps/example/src/application/commands.ts";
  const barrel = "apps/example/src/ports.ts";
  const adapter = "apps/example/src/infrastructure/sqlite/store.ts";
  const nodes = new Map<string, SourceNode>([
    [entry, { path: entry, dependencies: [barrel], requests: ["../ports"] }],
    [
      barrel,
      { path: barrel, dependencies: [adapter], requests: ["./infrastructure/sqlite/store"] },
    ],
  ]);
  expect(layerViolations(nodes)).toHaveLength(1);
  nodes.set(barrel, { path: barrel, dependencies: [], requests: [] });
  expect(layerViolations(nodes)).toEqual([]);
  const edges = imports(
    entry,
    'export * from "../ports"; const load = () => import("bun:sqlite");',
  );
  nodes.set(entry, {
    path: entry,
    dependencies: [barrel, ""],
    requests: edges.map((edge) => edge.request),
  });
  expect(layerViolations(nodes)).toHaveLength(1);
});
it("keeps page models independent from React and adapters independent from composition", () => {
  const model = "packages/example/src/model/submission.ts";
  const adapter = "apps/example/src/infrastructure/files.ts";
  const nodes = new Map<string, SourceNode>([
    [model, { path: model, dependencies: [""], requests: ["react"] }],
    [
      adapter,
      {
        path: adapter,
        dependencies: ["apps/example/src/runtime/index.ts"],
        requests: ["../runtime/index"],
      },
    ],
  ]);
  expect(layerViolations(nodes)).toHaveLength(2);
});
