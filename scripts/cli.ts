/**
 * CLI for raypx-scripts
 *
 * ⚠️  IMPORTANT: Parameter Handling Logic
 *
 * This CLI uses a specific parameter handling strategy to avoid common pitfalls:
 *
 * 1. Global flags (--help, --debug, --verbose) are parsed with yargs-parser
 * 2. Command arguments are extracted directly from rawArgs to preserve all flags
 * 3. Global flags are only processed when appropriate (no subcommand arguments)
 *
 * ❌ WRONG: Using parsed._ for command arguments (strips flags from subcommands)
 * ✅ CORRECT: Using rawArgs directly for command arguments (preserves all flags)
 *
 * Example:
 * - "raypx-scripts run pnpm --version" → remainingArgs = ["pnpm", "--version"] ✅
 * - NOT: remainingArgs = ["pnpm"] ❌
 */
/** biome-ignore-all lint/suspicious/noConsole: console is used for logging */

import { readdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@raypx/shared/logger";
import { createJiti } from "jiti";
import yargsParser from "yargs-parser";
import type { DefinedCmd } from "./lib/task";
import { formatDuration } from "./utils";

const jiti = createJiti(import.meta.url);

const globalOptions = [
  ["--help, -h", "Show this help message"],
  ["--debug, -d", "Enable debug logging"],
  ["--verbose, -V", "Enable verbose output"],
] as const;

/**
 * Automatically discover available commands from cmd directory
 */
async function discoverCommands(): Promise<
  Record<string, { name: string; desc?: string; file: string }>
> {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const cmdDir = join(__dirname, "cmd");

  try {
    const files = await readdir(cmdDir);
    const commands: Record<string, { name: string; desc?: string; file: string }> = {};

    for (const file of files) {
      if (!file.endsWith(".ts") || file === "index.ts") continue;

      const commandName = file.replace(/\.ts$/, "");
      const modulePath = `./cmd/${commandName}`;

      try {
        const module: DefinedCmd = await jiti.import(modulePath, { default: true });
        commands[commandName] = {
          name: module?.cmd || commandName,
          desc: module?.description,
          file: modulePath,
        };
      } catch (_error) {
        // If import fails, use defaults
        commands[commandName] = { name: commandName, file: modulePath };
      }
    }

    return commands;
  } catch (error) {
    logger.debug("Failed to discover commands, using fallback", error);
    return {};
  }
}

/**
 * Show help information for a specific command
 */
async function showCommandHelp(commandInfo: {
  name: string;
  desc?: string;
  file: string;
}): Promise<void> {
  // Try to load the command module to get additional help info
  try {
    const cmd: DefinedCmd = await jiti.import(commandInfo.file, { default: true });

    console.log(`
Usage: raypx-scripts ${commandInfo.name}

${commandInfo.desc || "No description available"}
${cmd.help ? `\n${cmd.help}\n` : ""}
${
  cmd.examples
    ? `Examples:
${cmd.examples.map((ex) => `  $ ${ex}`).join("\n")}
`
    : ""
}Options:
${globalOptions.map(([flag, description]) => `  ${flag.padEnd(18)} ${description}`).join("\n")}
`);
  } catch (_error) {
    // Fallback to basic help if command module can't be loaded
    console.log(`
Usage: raypx-scripts ${commandInfo.name}

${commandInfo.desc || "No description available"}

Options:
  --help, -h     Show this help message
`);
  }
}

/**
 * Show global help information
 */
async function showHelp(): Promise<void> {
  const commands = await discoverCommands();

  console.log(`
Usage: raypx-scripts <command> [args...]

Commands:`);
  Object.entries(commands).forEach(([_, info]) => {
    console.log(`  ${info.name.padEnd(18)} ${info.desc || ""}`);
  });
  const options = globalOptions.map(
    ([flag, description]) => `  ${flag!.padEnd(18)} ${description}`,
  );
  console.log(`
Options:
${options.join("\n")}

Run 'raypx-scripts <command> --help' for more information on a specific command.
`);
}

/**
 * Parse command line arguments using yargs-parser
 *
 * IMPORTANT: This function is ONLY used to extract global flags (--help, --debug, --verbose)
 * It should NOT be used to parse command arguments, as it would strip flags
 * from subcommands (e.g., "pnpm --version" would become just "pnpm")
 *
 * For command arguments, we use rawArgs directly to preserve all flags and options.
 */
function parseArgs(args: string[]) {
  return yargsParser(args, {
    boolean: ["help", "debug", "verbose"],
    alias: {
      help: ["h"],
      debug: ["d"],
      verbose: ["V"],
    },
  });
}

/**
 * CLI entry point for raypx-scripts
 */
async function cli(rawArgs: string[]) {
  // Parse arguments to extract global flags (--help, --version, --debug, etc.)
  // Note: We use yargs-parser only for global flags, NOT for command arguments
  const parsed = parseArgs(rawArgs);

  // Extract command name and arguments directly from rawArgs
  // This preserves all arguments including flags like --version for subcommands
  // Example: ["run", "pnpm", "--version"] -> commandName="run", remainingArgs=["pnpm", "--version"]
  const [commandName, ...remainingArgs] = rawArgs as string[];

  // Discover available commands
  const commands = await discoverCommands();
  const cmdInfo = commands[commandName as keyof typeof commands];

  // Handle global help: no command or --help flag with no other args
  if (!commandName || !cmdInfo || (parsed.help && remainingArgs.length === 0)) {
    await showHelp();
    return;
  }

  // Handle command-level help: "raypx-scripts run --help"
  // Only if single --help flag and command exists
  if (parsed.help && remainingArgs.length === 1) {
    await showCommandHelp(cmdInfo);
    return;
  }

  // Enable debug logging if requested (global flag)
  if (parsed.debug) {
    process.env.DEBUG = "true";
  }

  // Validate command exists
  if (!(commandName in commands)) {
    logger.error(`Command '${commandName}' not found`);
    console.log(`\nAvailable commands: ${Object.keys(commands).join(", ")}`);
    console.log("Use 'raypx-scripts --help' for more information");
    process.exit(1);
  }

  try {
    // Load and execute command
    const cmd: DefinedCmd = await jiti.import(commands[commandName]!.file, { default: true });
    const startTime = Date.now();

    // Execute the command with ALL remaining arguments preserved
    await cmd.run(remainingArgs);

    const totalDuration = Date.now() - startTime;
    logger.success(`Tasks completed in ${formatDuration(totalDuration)}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Command '${commandName}' failed: ${errorMessage}`);

    // Show debug info if available
    if (error instanceof Error && error.stack) {
      logger.debug("Error stack:", error.stack);
    }

    // Show helpful message for common errors
    if (errorMessage.includes("not found") || errorMessage.includes("ENOENT")) {
      logger.info("💡 Tip: Make sure the command exists and is properly configured");
    }

    process.exit(1);
  }
}

export default cli;
