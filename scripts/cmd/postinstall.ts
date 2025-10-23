import type { ListrTask } from "listr2";
import { createTask, definedCmd } from "../lib/task";
import { generateAllComponentExports } from "../utils";

const postinstallCmd = definedCmd({
  tasks: [
    !process.env.VERCEL ? createTask("pnpm exec lefthook install", "Lefthook") : undefined,
    createTask("Generate UI component exports", () => generateAllComponentExports()),
  ].filter(Boolean) as ListrTask[],
  description: "Run post-install tasks",
  type: "task",
  cmd: "postinstall",
});

export default postinstallCmd;
