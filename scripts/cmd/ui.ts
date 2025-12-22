import { createTask, defineCommand, runTasks } from "../lib/task";
import { generateComponentExports } from "../utils/component-exports";

const uiCmd = defineCommand({
  cmd: "ui",
  description: "Generate UI component exports",
  run: async () => {
    const tasks = [
      createTask("Generate UI component exports", () => generateComponentExports("components")),
      createTask("Generate UI business exports", () => generateComponentExports("business")),
    ];
    await runTasks(tasks);
  },
});

export default uiCmd;
