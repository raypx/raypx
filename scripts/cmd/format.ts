/**
 * Format and check code using Biome
 */
import { createTask, defineCommand, runTasks } from "../lib/task";

const formatCmd = defineCommand({
  cmd: "format",
  description: "Format and check code using Biome",
  run: async () => {
    const tasks = [
      createTask(["pnpm", "exec", "biome", "check", "--write", "."], {
        title: "Formatting with Biome",
        failureMessage: "Biome formatting failed",
      }),
    ];
    await runTasks(tasks);
  },
});

export default formatCmd;
