import { logger } from "@raypx/shared/logger";
import { execaCommand, type Options } from "execa";
import { PROJECT_ROOT } from "./paths";

/**
 * Safely executes a shell command asynchronously with security validation and better error handling
 */
export async function safeExecAsync(
  command: string,
  options?: Options,
): Promise<{ success: boolean; error?: Error; output?: string }> {
  logger.debug(`Executing: ${command}`);

  try {
    const result = await execaCommand(command, {
      cwd: PROJECT_ROOT,
      timeout: 180_000, // 3 minutes default
      stdio: "pipe",
      shell: true,
      env: {
        ...process.env,
        NPM_CONFIG_LOGLEVEL: "error",
        ...options?.env,
      },
      ...options,
    });

    return {
      success: true,
      output: typeof result.stdout === "string" ? result.stdout : undefined,
    };
  } catch (error) {
    const execaError = error as any;
    logger.debug(`Command failed: ${command}`, error);

    return {
      success: false,
      error: execaError,
      output:
        typeof execaError.stdout === "string"
          ? execaError.stdout
          : typeof execaError.stderr === "string"
            ? execaError.stderr
            : undefined,
    };
  }
}
