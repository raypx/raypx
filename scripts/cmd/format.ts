import type { ListrTask } from "listr2";
import { createTask, definedCmd } from "../lib/task";
import { safeExec } from "../utils";

/**
 * Creates a task that formats and checks code using Biome
 */
function createFormatTask(): ListrTask {
  return createTask("Code formatting and checking", (_, task) => {
    const success = safeExec("pnpm exec biome check --write .");

    if (success) {
      task.title = "Formatted and checked code with Biome";
    } else {
      task.title = "Code formatting and checking failed";
      throw new Error("Biome formatting and checking failed");
    }
  });
}

/**
 * Main format function
 */
const format = definedCmd([createFormatTask()]);

export default format;
