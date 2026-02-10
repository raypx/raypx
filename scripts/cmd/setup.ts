import { createTask, defineCommand, runTasks } from "../lib/task";

const setupCmd = defineCommand({
  cmd: "setup",
  description: "Setup project dependencies",
  help: `Run initial setup tasks for the project.

This will:
- Run database migrations
- Install git hooks (via lefthook)`,
  run: async () => {
    const tasks = [
      createTask(["pnpm", "db", "migrate", "all"], "Database migrations"),
      createTask(["pnpm", "exec", "lefthook", "install"], {
        title: "Install git hooks",
        allowFailure: true,
      }),
    ];
    await runTasks(tasks);
  },
});

export default setupCmd;
