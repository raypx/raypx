/**
 * Format and check code using Biome
 *
 * This command runs Biome to format code, check for issues, and enforce
 * coding standards across the project.
 */
import { defineCommand } from "../lib/task";
import { safeExecAsync } from "../utils";

/**
 * Main format command - simplified to direct execution
 * Single task doesn't need listr2 overhead
 */
const formatCmd = defineCommand({
  cmd: "format",
  description: "Format and check code using Biome",
  run: async () => {
    const result = await safeExecAsync("pnpm exec biome check --write .");

    if (!result.success) {
      throw result.error || new Error("Biome formatting and checking failed");
    }
  },
});

export default formatCmd;
