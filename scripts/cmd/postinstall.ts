import { createTask, defineCommand, runTasks } from "../lib/task";

const postinstallCmd = defineCommand({
  cmd: "postinstall",
  description: "Run post-install tasks",
  run: async () => {
    const tasks: ReturnType<typeof createTask>[] = [];

    // Only install lefthook if not in CI environment
    if (!process.env.CI) {
      tasks.push(
        createTask(["pnpm", "exec", "lefthook", "install"], {
          title: "Install Lefthook",
          allowFailure: true,
        }),
      );
    }

    if (tasks.length > 0) {
      await runTasks({ tasks });
    }
  },
});

export default postinstallCmd;
