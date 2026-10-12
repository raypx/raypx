import { defineCommand } from "citty";

import { runCliAction } from "../runtime/action.js";
import { commandAfterSeparator } from "../arguments.js";

export async function runEnvCommand(command: readonly string[]): Promise<void> {
  await runCliAction(
    "env",
    async () => {
      const { runWithRepositoryEnv } = await import("../env-runner.js");
      const result = await runWithRepositoryEnv(command);
      if (result.signal) {
        process.kill(process.pid, result.signal);
        return;
      }
      process.exitCode = result.code ?? 1;
    },
    { plainErrors: true },
  );
}

export const envCommand = defineCommand({
  meta: {
    name: "env",
    description: "Run a command with repository environment files",
  },
  async run({ rawArgs }) {
    await runEnvCommand(commandAfterSeparator(rawArgs));
  },
});
