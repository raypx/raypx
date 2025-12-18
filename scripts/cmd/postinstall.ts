import { createTask, defineCommand, runTasks } from "../lib/task";
import { generateAllComponentExports } from "../utils";

const postinstallCmd = defineCommand({
  cmd: "postinstall",
  description: "Run post-install tasks",
  run: async () => {
    const tasks = [];

    // Only install lefthook if not in CI environment (skip in Docker/CI)
    if (!process.env.CI) {
      tasks.push(
        createTask("pnpm exec lefthook install", {
          title: "Install Lefthook",
          allowFailure: true, // Allow failure without stopping the process
        }),
      );
    }

    tasks.push(createTask("Generate UI component exports", () => generateAllComponentExports()));

    // Serial execution to ensure proper setup order
    await runTasks(tasks);
  },
});

export default postinstallCmd;
