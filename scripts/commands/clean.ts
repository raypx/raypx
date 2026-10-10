import { fileURLToPath } from "node:url";
import { defineCommand } from "citty";
import { installedCommands } from "../lib/cli/bootstrap.ts";
import { scriptLogger } from "../lib/logger.ts";

export default defineCommand({
  meta: { name: "clean", description: installedCommands.clean.description },
  args: {
    "dry-run": { type: "boolean", description: "List generated artifacts without deleting them" },
  },
  async run({ args }) {
    const { cleanRepository } = await import("../lib/clean.ts");
    const paths = await cleanRepository(
      fileURLToPath(new URL("../../", import.meta.url)),
      args["dry-run"],
    );
    for (const path of paths)
      scriptLogger.info(`${args["dry-run"] ? "Would remove" : "Removed"} ${path}`);
    scriptLogger.success(
      paths.length
        ? `${args["dry-run"] ? "Would remove" : "Removed"} ${paths.length} generated artifact paths.`
        : "No generated artifacts to clean.",
    );
  },
});
