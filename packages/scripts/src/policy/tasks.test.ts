import { describe, expect, it } from "vite-plus/test";
import { validateTaskGraph } from "./checks/tasks.js";
import { readFileSync } from "node:fs";

const config = () =>
  JSON.parse(readFileSync(new URL("../../../../turbo.json", import.meta.url), "utf8"));
describe("task graph policy", () => {
  it("accepts the repository graph including source-export transit nodes", () => {
    expect(validateTaskGraph(config())).toEqual([]);
  });
  it("rejects cached database and real runtime tasks", () => {
    const graph = config();
    graph.tasks.e2e.cache = true;
    graph.tasks.smoke.cache = true;
    expect(validateTaskGraph(graph).map((f) => f.message)).toEqual([
      "e2e must execute every time",
      "smoke must execute every time",
    ]);
  });
  it("rejects workspace overrides that cache external effects", () => {
    const graph = config();
    graph.tasks["@raypx/e2e#e2e"] = { cache: true };
    expect(validateTaskGraph(graph).map((f) => f.message)).toEqual([
      "@raypx/e2e#e2e must execute every time",
    ]);
  });
  it.each(["e2e:web", "e2e:desktop"])("rejects caching the %s browser suite", (task) => {
    const graph = config();
    graph.tasks[task].cache = true;
    expect(validateTaskGraph(graph).map((f) => f.message)).toEqual([
      `${task} must execute every time`,
    ]);
  });
  it.each(["e2e:web", "e2e:desktop"])(
    "rejects workspace overrides that cache the %s browser suite",
    (task) => {
      const graph = config();
      const qualifiedTask = `@raypx/e2e#${task}`;
      graph.tasks[qualifiedTask] = { cache: true };
      expect(validateTaskGraph(graph).map((f) => f.message)).toEqual([
        `${qualifiedTask} must execute every time`,
      ]);
    },
  );
  it("rejects a graph that bypasses checks or omits the platform and signature boundaries", () => {
    const graph = config();
    graph.tasks.build.dependsOn = [];
    graph.globalEnv = [];
    graph.remoteCache.signature = false;
    expect(validateTaskGraph(graph)).toHaveLength(5);
  });
});
