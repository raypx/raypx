import { createTask, defineCommand, runTasks } from "../lib/task";
import { generateAllComponentExports } from "../utils/component-exports";

const uiCmd = defineCommand({
  cmd: "ui",
  description: "Generate UI component exports",
  run: async () => {
    const tasks = [
      createTask("Generate UI component exports", () => generateAllComponentExports()),
    ];
    await runTasks(tasks);
  },
});

export default uiCmd;
