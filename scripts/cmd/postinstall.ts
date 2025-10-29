import type { ListrTask } from "listr2";
import { createTask, defineCommand, runTasks } from "../lib/task";
import { generateAllComponentExports } from "../utils";

const postinstallCmd = defineCommand({
  cmd: "postinstall",
  description: "Run post-install tasks",
  run: async () => {
    const tasks = [
      !process.env.VERCEL && createTask("pnpm exec lefthook install", "Install Lefthook"),
      createTask("Generate UI component exports", () => generateAllComponentExports()),
    ].filter(Boolean) as ListrTask[];

    // Serial execution to ensure proper setup order
    await runTasks(tasks, false);
  },
});

export default postinstallCmd;
