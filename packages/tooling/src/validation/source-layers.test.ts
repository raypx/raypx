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
it("allows provider ports in application code but keeps concrete adapters behind infrastructure", () => {
  const entry = "apps/example/src/application/providers.ts";
  const violationsFor = (requests: string[]) =>
    layerViolations(
      new Map<string, SourceNode>([[entry, { path: entry, dependencies: [], requests }]]),
    );

  expect(violationsFor(["@raypx/providers/core"])).toEqual([]);
  expect(violationsFor(["@raypx/providers/codex"])).toHaveLength(1);
  expect(violationsFor(["@raypx/providers/claude"])).toHaveLength(1);
  expect(violationsFor(["@raypx/providers/pi/context"])).toHaveLength(1);
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
it("keeps contracts free of React, UI, presentation and platform-server surfaces", () => {
  const contracts = "packages/contracts/src/api.ts";
  const violationsFor = (requests: string[]) =>
    layerViolations(
      new Map<string, SourceNode>([[contracts, { path: contracts, dependencies: [], requests }]]),
    );

  expect(violationsFor(["@raypx/core/tasks", "@raypx/jobs-model", "zod", "./access.js"])).toEqual(
    [],
  );
  expect(violationsFor(["react"])).toHaveLength(1);
  expect(violationsFor(["react-dom/client"])).toHaveLength(1);
  expect(violationsFor(["@raypx/ui/button"])).toHaveLength(1);
  expect(violationsFor(["@raypx/i18n/browser"])).toHaveLength(1);
  expect(violationsFor(["@raypx/icons/plus"])).toHaveLength(1);
  expect(violationsFor(["@raypx/client/api"])).toHaveLength(1);
  expect(violationsFor(["@raypx/auth/permissions"])).toHaveLength(1);
  expect(violationsFor(["@raypx/jobs-server"])).toHaveLength(1);
  expect(violationsFor(["@raypx/memory-server"])).toHaveLength(1);
  expect(violationsFor(["@raypx/memory/client"])).toHaveLength(1);
  expect(violationsFor(["@raypx/database/crypto"])).toHaveLength(1);
});

it("follows re-exports so a contracts barrel cannot smuggle a React surface", () => {
  const contracts = "packages/contracts/src/api.ts";
  const barrel = "packages/contracts/src/access.ts";
  const nodes = new Map<string, SourceNode>([
    [contracts, { path: contracts, dependencies: [barrel], requests: ["./access.js"] }],
    [barrel, { path: barrel, dependencies: [], requests: ["@raypx/ui/button"] }],
  ]);
  // Both nodes live in the contracts layer, so each reports its own violation.
  expect(layerViolations(nodes)).toHaveLength(2);
});
it("limits the Agent orchestration domain to Core schemas, zod and its own files", () => {
  const domain = "apps/cli/src/runtime/agents/domain/decider.ts";
  const events = "apps/cli/src/runtime/agents/domain/events.ts";
  const nodes = new Map<string, SourceNode>([
    [
      domain,
      {
        path: domain,
        dependencies: ["packages/core/src/tasks.ts", events],
        requests: ["@raypx/core/tasks", "./events"],
      },
    ],
    [events, { path: events, dependencies: [""], requests: ["zod"] }],
  ]);
  expect(layerViolations(nodes)).toEqual([]);
  // A sibling import that resolves outside the domain folder is a violation.
  nodes.set(events, {
    path: events,
    dependencies: ["apps/cli/src/runtime/agents/model.ts"],
    requests: ["../model"],
  });
  // The transitive walk reports the origin that reaches it and the offending file.
  expect(layerViolations(nodes)).toContainEqual(
    expect.stringContaining(
      "apps/cli/src/runtime/agents/domain/events.ts: orchestration-domain reaches forbidden dependency ../model",
    ),
  );
  // So is a contract/wire dependency from the domain.
  nodes.set(events, {
    path: events,
    dependencies: [""],
    requests: ["@raypx/contracts/tasks"],
  });
  expect(layerViolations(nodes)).toContainEqual(
    expect.stringContaining(
      "orchestration-domain reaches forbidden dependency @raypx/contracts/tasks",
    ),
  );
});
