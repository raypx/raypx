/**
 * Format and check code using Biome
 *
 * This command runs Biome to format code, check for issues, and enforce
 * coding standards across the project.
 */
import { createTask, defineCommand, runTasks } from "../lib/task";

/**
 * Main format command using task orchestration
 * Provides consistent logging and error handling across all commands
 */
const formatCmd = defineCommand({
  cmd: "format",
  description: "Format and check code using Biome",
  run: async () => {
    const tasks = [
      // New recommended API: command array for type safety
      createTask(["pnpm", "exec", "biome", "check", "--write", "."], {
        title: "Formatting with Biome",
        successTitle: "Formatted code successfully",
        failureMessage: "Biome formatting failed",
      }),
    ];
    await runTasks(tasks);
  },
});

export default formatCmd;
