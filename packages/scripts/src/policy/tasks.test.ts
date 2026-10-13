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
  it("rejects the retired Worker runtime preparation task", () => {
    const graph = config();
    graph.tasks["worker#runtime:prepare"] = {
      dependsOn: ["check", "^build", "^transit"],
      cache: false,
      outputs: [],
    };
    expect(validateTaskGraph(graph).map((finding) => finding.message)).toContain(
      "Worker Nitro builds must not retain the retired runtime:prepare task",
    );
  });
  it.each(["runtime:prepare", "worker#runtime:prepare"])(
    "rejects a stale Worker prerequisite on %s",
    (dependency) => {
      const graph = config();
      graph.tasks["worker#build"].dependsOn.push(dependency);
      expect(validateTaskGraph(graph).map((finding) => finding.message)).toContain(
        "Worker Nitro builds must not retain the retired runtime:prepare task",
      );
    },
  );
  it("rejects Worker builds bypassing source propagation and standard checks", () => {
    const graph = config();
    graph.tasks["worker#build"].dependsOn = [];
    for (const edge of ["check", "^build", "^transit"])
      expect(validateTaskGraph(graph).map((finding) => finding.message)).toContain(
        `worker#build must depend on ${edge}`,
      );
  });
  it.each([
    ["legacy bundles", ["dist/index.mjs", "dist/runner.mjs"]],
    ["only the host", [".output/server/index.mjs"]],
    ["only executable bundles", [".output/server/index.mjs", ".output/server/runner.mjs"]],
    ["extra legacy output", [".output/**", "dist/**"]],
    ["no output", []],
  ])("rejects a partial Worker Nitro cache: %s", (_name, outputs) => {
    const graph = config();
    graph.tasks["worker#build"].outputs = outputs;
    expect(validateTaskGraph(graph).map((finding) => finding.message)).toContain(
      "worker#build must cache the complete .output/** Nitro artifact, including executable code and runtime dependencies",
    );
  });
  it("accepts qualified local Worker prerequisites", () => {
    const graph = config();
    graph.tasks["worker#build"].dependsOn = ["worker#check", "^build", "^transit"];
    expect(validateTaskGraph(graph)).toEqual([]);
  });
});
