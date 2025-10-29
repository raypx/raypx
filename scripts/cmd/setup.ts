import { createTask, defineCommand, runTasks } from "../lib/task";

const setupCmd = defineCommand({
  cmd: "setup",
  description: "Setup project dependencies",
  run: async () => {
    const tasks = [createTask("pnpm --filter @raypx/db run db:migrate", "Database migration")];
    await runTasks(tasks);
  },
});

export default setupCmd;
