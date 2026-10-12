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
    graph.tasks["@voidmix/e2e#e2e"] = { cache: true };
    expect(validateTaskGraph(graph).map((f) => f.message)).toEqual([
      "@voidmix/e2e#e2e must execute every time",
    ]);
  });
  it("rejects a graph that bypasses checks or omits the platform and signature boundaries", () => {
    const graph = config();
    graph.tasks.build.dependsOn = [];
    graph.globalEnv = [];
    graph.remoteCache.signature = false;
    expect(validateTaskGraph(graph)).toHaveLength(5);
  });
});
