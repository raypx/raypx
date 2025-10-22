/**
 * Clean build artifacts and cache files
 *
 * This command removes build outputs, cache directories, and temporary files
 * to ensure a clean build environment.
 */
import type { ListrTask } from "listr2";
import { rimraf } from "rimraf";
import { createTask, definedCmd } from "../lib/task";
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
 * Creates a task that runs the monorepo clean command
 */
function createWorkspaceCleanTask(): ListrTask {
  return createTask("pnpm -r --if-present --parallel clean", "Monorepo clean");
}

/**
 * Creates a task that cleans files using glob patterns
 */
function createFileCleanTask(): ListrTask {
  return createTask("Cleaning files and directories", async (_, task) => {
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
  });
}

/**
 * Main clean function
 */
const cleanCmd = definedCmd({
  tasks: [createWorkspaceCleanTask(), createFileCleanTask()],
  description: "Clean build artifacts and cache files",
  type: "task",
  cmd: "clean",
});

export default cleanCmd;
