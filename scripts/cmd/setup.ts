import { createTask, defineCommand, runTasks } from "../lib/task";

const setupCmd = defineCommand({
  cmd: "setup",
  description: "Setup project dependencies",
  run: async () => {
    await runTasks([createTask("pnpm --filter @raypx/db run db:migrate", "Database migration")]);
  },
});

export default setupCmd;
