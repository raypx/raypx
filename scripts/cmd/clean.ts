/**
 * Clean build artifacts and Vite dependency cache
 */
import { rimraf } from "rimraf";
import { createTask, defineCommand, runTasks } from "../lib/task";
import { PROJECT_ROOT } from "../utils";

const cleanCmd = defineCommand({
  cmd: "clean",
  description: "Clean build artifacts and Vite dependency cache",
  run: async () => {
    const tasks = [
      // Run workspace clean scripts (each package/app handles its own cleanup)
      createTask(["turbo", "clean"], {
        title: "Workspace clean",
        successTitle: "Workspace clean completed",
      }),
      // Clean Vite dependency cache (node_modules/.vite)
      createTask("Clean Vite dependency cache", async (ctx) => {
        await rimraf("**/node_modules/.vite", {
          glob: { cwd: PROJECT_ROOT },
        });
        ctx.title = "Vite cache cleaned successfully";
      }),
    ];
    await runTasks(tasks);
  },
});

export default cleanCmd;
