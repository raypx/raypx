import { processDependencies } from "../test-fixtures.js";
import { describe, expect, it } from "vite-plus/test";

import { runSkillsUpdate } from "./operations.js";

describe("skills maintenance", () => {
  it("runs the repository skill updater non-interactively", async () => {
    const dependencies = processDependencies();
    const { log, runCommand } = dependencies;

    await runSkillsUpdate(dependencies);

    expect(runCommand).toHaveBeenCalledWith(["bunx", "skills", "update", "-p", "-y"], {
      cwd: "/repo",
      env: dependencies.processEnv,
    });
    expect(log).toHaveBeenNthCalledWith(1, "info", "skills.update.started");
    expect(log).toHaveBeenNthCalledWith(2, "info", "skills.update.completed");
  });
});
