import { fileURLToPath } from "node:url";
import { defineCommand, runMain } from "citty";
import { bootstrapCommands, isBootstrapCommand, toolVersion } from "./lib/cli/bootstrap.ts";
import { validateConsumerArgs } from "./lib/consumer/cli.ts";
import { scriptLogger } from "./lib/logger.ts";

const repository = fileURLToPath(new URL("../", import.meta.url));
const command = defineCommand({
  meta: {
    name: "raypx",
    version: toolVersion(repository),
    description: "Raypx repository tools",
  },
  subCommands: {
    doctor: { meta: { name: "doctor", description: bootstrapCommands.doctor.description } },
    env: { meta: { name: "env", description: bootstrapCommands.env.description } },
    setup: { meta: { name: "setup", description: bootstrapCommands.setup.description } },
    consumer: async () => (await import("./commands/consumer.ts")).default,
    "consumer-browser": async () => (await import("./commands/consumer-browser.ts")).default,
  },
});

/** Dispatch installed commands after strict validation, without preparing help requests. */
export async function runCli(rawArgs: string[]): Promise<void> {
  try {
    const [name, ...args] = rawArgs;
    if (name === "consumer" || name === "consumer-browser") {
      validateConsumerArgs(args, name === "consumer");
    } else if (isBootstrapCommand(name)) {
      if (args.length !== 1 || (args[0] !== "--help" && args[0] !== "-h")) {
        throw new Error(`Run raypx ${name} through scripts/bin/raypx.ts.`);
      }
    } else if (
      name !== undefined &&
      !(rawArgs.length === 1 && ["--help", "-h", "--version", "-v"].includes(name))
    ) {
      throw new Error(
        name.startsWith("-")
          ? "Root options must be used on their own. Use raypx <command> --help."
          : `Unknown command: ${name}. Use raypx --help.`,
      );
    }
    await runMain(command, { rawArgs: rawArgs.length ? rawArgs : ["--help"] });
  } catch (error) {
    scriptLogger.error(error instanceof Error ? error.message : "Raypx command failed");
    process.exitCode = 1;
  }
}
