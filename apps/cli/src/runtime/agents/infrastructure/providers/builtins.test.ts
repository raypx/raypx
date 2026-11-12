import { describe, expect, it } from "vitest";
import { agentProviders } from "@raypx/core/tasks";
import { builtinDrivers } from "./builtins.js";

describe("builtin provider set", () => {
  it("covers every provider core can route to, exactly once", () => {
    const providers = builtinDrivers().map((driver) => driver.provider);

    // Set equality, not order: capability lists go over the wire in their own order.
    expect(new Set(providers)).toEqual(new Set(agentProviders));
    expect(providers).toHaveLength(agentProviders.length);
  });

  it("drives Pi locally and the process providers remotely", () => {
    const drivers = builtinDrivers();
    const remote = drivers.filter((driver) => driver.remote).map((driver) => driver.provider);
    expect(remote.sort()).toEqual(["claude", "codex"]);
    expect(drivers.filter((driver) => !driver.remote).map((driver) => driver.provider)).toEqual([
      "pi",
    ]);
  });
});
