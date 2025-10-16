import type { ListrTask } from "listr2";
import { createTask, definedCmd } from "../lib/task";
import { safeExec } from "../utils";

/**
 * Creates a task that formats code using Biome
 */
function createFormatTask(): ListrTask {
  return createTask("Code formatting", (_, task) => {
    const formatSuccess = safeExec("pnpm exec biome format --write .");

    if (formatSuccess) {
      task.title = "Formatted code with Biome";
    } else {
      task.title = "Code formatting failed";
      throw new Error("Biome formatting failed");
    }
    const checkSuccess = safeExec("pnpm exec biome check --write .");

    if (checkSuccess) {
      task.title = "Checked code with Biome";
    } else {
      task.title = "Code checking failed";
      throw new Error("Biome checking failed");
    }
  });
}

/**
 * Main format function
 */
const format = definedCmd([createFormatTask()]);

export default format;
