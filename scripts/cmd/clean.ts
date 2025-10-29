/**
 * Clean build artifacts and cache files
 *
 * This command removes build outputs, cache directories, and temporary files
 * to ensure a clean build environment.
 */
import { rimraf } from "rimraf";
import { createTask, defineCommand, runTasks } from "../lib/task";
import { PROJECT_ROOT } from "../utils";

/**
 * File patterns to clean during cleanup operations
 * Organized by category for better maintainability
 */
const CLEAN_PATTERNS = {
  build: ["**/dist", "**/.output", "**/.nitro"],
  cache: ["**/.turbo", "**/.tanstack", "**/.source"],
  typescript: ["**/tsconfig.tsbuildinfo"],
  testing: ["**/coverage"],
  deployment: ["**/.vercel"],
} as const;

const ALL_CLEAN_PATTERNS = Object.values(CLEAN_PATTERNS).flat();

/**
 * Main clean command
 * Tasks run serially to ensure workspace clean completes before file clean
 */
const cleanCmd = defineCommand({
  cmd: "clean",
  description: "Clean build artifacts and cache files",
  run: async () => {
    await runTasks(
      [
        createTask("pnpm -r --if-present --parallel clean", "Workspace clean"),
        createTask("Clean files and directories", async (_, task) => {
          try {
            await rimraf(ALL_CLEAN_PATTERNS, {
              glob: {
                cwd: PROJECT_ROOT,
              },
            });

            task.title = `Cleaned ${ALL_CLEAN_PATTERNS.length} patterns successfully`;
          } catch (error) {
            task.title = "File cleaning failed";
            throw new Error(`File cleaning failed: ${error}`);
          }
        }),
      ],
      false, // Serial execution - workspace clean must complete first
    );
  },
});

export default cleanCmd;
