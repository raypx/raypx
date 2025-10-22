import { logger } from "@raypx/shared/logger";
import { createJiti } from "jiti";
import { camelCase } from "lodash-es";
import type { DefinedCmd } from "./lib/task";
import { formatDuration } from "./utils";

const jiti = createJiti(import.meta.url);

/**
 * CLI entry point for raypx-scripts
 */
async function cli(name: string) {
  const cmd: DefinedCmd = await jiti.import(`./cmd/${camelCase(name)}.ts`, { default: true });

  if (!cmd) {
    logger.error(`Command ${name} not found`);
    process.exit(1);
  }

  try {
    const startTime = Date.now();
    await cmd.run();
    const totalDuration = Date.now() - startTime;
    logger.success(`Tasks completed in ${formatDuration(totalDuration)}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    logger.error(`Command ${name} failed:`, errorMessage);
    if (error instanceof Error && "stack" in error) {
      logger.debug("Error stack:", error.stack);
    }
    process.exit(1);
  }
}

export default cli;
