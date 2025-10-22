import { createTask, definedCmd } from "../lib/task";

const setupCmd = definedCmd({
  tasks: [createTask("pnpm --filter @raypx/db run db:migrate", "Database migration")],
  options: {
    concurrent: true, // Enable concurrent execution
    exitOnError: true, // Exit immediately on error
  },
  description: "Setup project dependencies",
  type: "task",
  cmd: "setup",
});

export default setupCmd;
