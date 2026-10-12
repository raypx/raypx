import { describe, expect, it } from "vite-plus/test";

import { commandAfterSeparator } from "./arguments.js";

describe("commandAfterSeparator", () => {
  it("preserves every argument after the command separator", () => {
    expect(
      commandAfterSeparator([
        "env",
        "--",
        "node",
        "script with spaces.mjs",
        "--flag=value",
        "positional",
      ]),
    ).toEqual(["node", "script with spaces.mjs", "--flag=value", "positional"]);
  });

  it("returns an empty command when the separator is absent", () => {
    expect(commandAfterSeparator(["env", "node", "script.mjs"])).toEqual([]);
  });
});
