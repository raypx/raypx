import { defineCommand, type ArgsDef, type CommandDef, type CommandContext } from "citty";
import { runContextualAction } from "./action.js";
import type { CommandContextForPolicy, CommandContextPolicy } from "./context.js";
import type { runCommand } from "./process.js";

type Dependencies<P extends CommandContextPolicy> = CommandContextForPolicy<P> & {
  runCommand: typeof runCommand;
};

/** Create the environment and error boundary once; operations still accept injected dependencies. */
export function contextualCommand<P extends CommandContextPolicy, A extends ArgsDef>(
  command: string,
  policy: P,
  definition: Omit<CommandDef<A>, "run"> & {
    run(context: Dependencies<P>, cli: CommandContext<A>): Promise<void>;
  },
): CommandDef<A> {
  return defineCommand({
    ...definition,
    run: (cli) =>
      runContextualAction(command, policy, async (context) => {
        const { runCommand } = await import("./process.js");
        await definition.run({ ...context, runCommand }, cli);
      }),
  });
}
