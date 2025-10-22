import { createTask, definedCmd } from "../lib/task";
import { generateAllComponentExports } from "../utils";

const postinstallCmd = definedCmd({
  tasks: [
    createTask("pnpm exec lefthook install", "Lefthook"),
    createTask("Generate UI component exports", () => generateAllComponentExports()),
  ],
  description: "Run post-install tasks",
  type: "task",
  cmd: "postinstall",
});

export default postinstallCmd;
