import { fileURLToPath } from "node:url";
import { defineCommand } from "citty";
import { installedCommands } from "../lib/cli/bootstrap.ts";
import { scriptLogger } from "../lib/logger.ts";

export default defineCommand({
  meta: { name: "deps", description: installedCommands.deps.description },
  async run() {
    const { checkRepositoryDependencies } = await import("../lib/dependencies/check.ts");
    const issues = await checkRepositoryDependencies(
      fileURLToPath(new URL("../../", import.meta.url)),
    );
    if (issues.length) throw new Error(`Dependency groups are inconsistent:\n${issues.join("\n")}`);
    scriptLogger.success("Dependency groups are consistent with the installed Vite+ runner.");
  },
});
