/**
 * Format and check code using Biome
 *
 * This command runs Biome to format code, check for issues, and enforce
 * coding standards across the project.
 */
import type { ListrTask } from "listr2";
import { createTask, definedCmd } from "../lib/task";
import { safeExecAsync } from "../utils";

/**
 * Creates a task that formats and checks code using Biome
 */
function createFormatTask(): ListrTask {
  return createTask("Code formatting and checking", async (_, task) => {
    const result = await safeExecAsync("pnpm exec biome check --write .");

    if (result.success) {
      task.title = "Formatted and checked code with Biome";
    } else {
      task.title = "Code formatting and checking failed";
      throw result.error || new Error("Biome formatting and checking failed");
    }
  });
}

/**
 * Main format function
 */
const formatCmd = definedCmd({
  tasks: [createFormatTask()],
  description: "Format and check code using Biome",
  type: "task",
  cmd: "format",
});

export default formatCmd;
