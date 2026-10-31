import { describe, expect, it } from "vite-plus/test";
import { createRuntime } from "../../../src/runtime/index.js";
import { runtimeFixtures } from "../../helpers/runtime.js";
import { StateStore } from "../../../src/runtime/state/index.js";

const { fixture } = runtimeFixtures();

describe("device state", () => {
  it("preserves grant order, revisions and bounded run history across reopen", async () => {
    const { runtime, grant } = await fixture();
    const state = runtime.state;
    const revision = state.revision();
    const second = { ...grant, id: crypto.randomUUID() };
    state.putRoot(second);
    state.putRoot(grant);
    expect(state.roots().map((root) => root.id)).toEqual([second.id, grant.id]);
    expect(state.revision()).toBe(revision + 2);
    const now = Date.now();
    const jobId = crypto.randomUUID();
    for (let index = 0; index < 105; index++)
      state.putRun({
        id: `run-${index}`,
        jobId,
        startedAt: new Date(now + index).toISOString(),
        finishedAt: null,
        status: "running",
        output: "",
        exitCode: null,
      });
    const reopened = new StateStore(state.directory);
    try {
      expect(reopened.roots()).toEqual(state.roots());
      expect(reopened.revision()).toBe(revision + 2);
      expect(reopened.history(jobId).map((run) => run.id)).toEqual(
        Array.from({ length: 100 }, (_, index) => `run-${104 - index}`),
      );
    } finally {
      reopened.close();
    }
  });
  it("refuses a newer schema and never migrates while another runtime holds a lease", async () => {
    const { runtime, dir } = await fixture();
    runtime.state.db.$client.exec("PRAGMA user_version=0");
    expect(() => createRuntime({ dataDir: dir })).toThrow(/locked/i);
    runtime.state.db.$client.exec("PRAGMA user_version=2");
    expect(() => createRuntime({ dataDir: dir })).toThrow(/newer Raypx/);
    runtime.state.db.$client.exec("PRAGMA user_version=1");
  });
});
