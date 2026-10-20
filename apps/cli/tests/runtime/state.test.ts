import { describe, expect, it } from "vite-plus/test";
import { createRuntime } from "../../src/runtime/index.js";
import { runtimeFixtures } from "../helpers/runtime.js";

const { fixture } = runtimeFixtures();

describe("device state", () => {
  it("refuses a newer schema and never migrates while another runtime holds a lease", async () => {
    const { runtime, dir } = await fixture();
    runtime.state.db.exec("PRAGMA user_version=0");
    expect(() => createRuntime({ dataDir: dir })).toThrow(/locked/i);
    runtime.state.db.exec("PRAGMA user_version=2");
    expect(() => createRuntime({ dataDir: dir })).toThrow(/newer Raypx/);
    runtime.state.db.exec("PRAGMA user_version=1");
  });
});
