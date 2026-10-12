import type { CommandContextForPolicy, CommandContextPolicy } from "./context.js";
import type { ScriptsLog } from "./logger.js";
import { ProcessError } from "./process.js";

export interface CliActionControl {
  // A function-valued property rather than a method: callers destructure it off
  // the control object, and it never reads `this`.
  setLogger: (logger: ScriptsLog) => void;
}

async function fallbackLog(command: string, message: string): Promise<void> {
  try {
    const [{ getScriptsEnv }, { resolveProcessEnvironment }, { createScriptsLogger }] =
      await Promise.all([import("../env.js"), import("./env.js"), import("./logger.js")]);
    const processEnv = resolveProcessEnvironment("process");
    createScriptsLogger(getScriptsEnv(processEnv), processEnv)("error", "command.failed", {
      command,
      message,
    });
  } catch {
    console.error(`vmx ${command} failed: ${message}`);
  }
}

export async function runCliAction(
  command: string,
  action: (control: CliActionControl) => Promise<void>,
  options: { plainErrors?: boolean } = {},
): Promise<void> {
  let commandLogger: ScriptsLog | undefined;

  try {
    await action({
      setLogger(logger) {
        commandLogger = logger;
      },
    });
  } catch (error) {
    if (error instanceof ProcessError && error.signal) {
      process.kill(process.pid, error.signal);
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    if (options.plainErrors) {
      console.error(`vmx ${command} failed: ${message}`);
    } else if (commandLogger) {
      try {
        commandLogger("error", "command.failed", { command, message });
      } catch {
        console.error(`vmx ${command} failed: ${message}`);
      }
    } else {
      await fallbackLog(command, message);
    }
    process.exitCode = error instanceof ProcessError ? (error.exitCode ?? 1) : 1;
  }
}

export async function runContextualAction<Policy extends CommandContextPolicy>(
  command: string,
  policy: Policy,
  action: (context: CommandContextForPolicy<Policy>) => Promise<void>,
): Promise<void> {
  await runCliAction(command, async ({ setLogger }) => {
    const { createCommandContext } = await import("./context.js");
    const context = createCommandContext(policy);
    setLogger(context.log);
    await action(context);
  });
}
