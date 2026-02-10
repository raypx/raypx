import { x } from "tinyexec";
import { logger } from "./logger";
import { PROJECT_ROOT } from "./paths";

/**
 * Result of command execution
 */
export interface ExecResult {
  success: boolean;
  error?: Error;
  output?: string;
  exitCode?: number;
}

/**
 * Options for command execution
 */
export interface ExecOptions {
  /** Working directory (defaults to PROJECT_ROOT) */
  cwd?: string;
  /** Execution timeout in milliseconds (defaults to 180000ms) */
  timeout?: number;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Whether to throw on non-zero exit code (defaults to false) */
  throwOnError?: boolean;
}

const DEFAULT_TIMEOUT = 180_000;

/**
 * Execute command with type-safe arguments
 */
export async function execCommand(
  command: string,
  args: string[] = [],
  options: ExecOptions = {},
): Promise<ExecResult> {
  const {
    cwd = PROJECT_ROOT,
    timeout = DEFAULT_TIMEOUT,
    env = {},
    throwOnError = false,
  } = options;

  logger.debug(`Executing: ${command} ${args.join(" ")}`);

  try {
    const result = await x(command, args, {
      nodeOptions: {
        cwd,
        env: { ...process.env, NPM_CONFIG_LOGLEVEL: "error", ...env },
      },
      timeout,
      throwOnError: false,
    });

    if (result.exitCode !== 0) {
      const error = new Error(`Command exited with code ${result.exitCode}`);
      console.error(result.stderr);

      if (throwOnError) throw error;

      return {
        success: false,
        error,
        output: result.stderr ?? result.stdout,
        exitCode: result.exitCode,
      };
    }

    return {
      success: true,
      output: result.stdout,
      exitCode: result.exitCode,
    };
  } catch (error) {
    const execError = error as {
      stdout?: string;
      stderr?: string;
      exitCode?: number;
    };

    logger.debug(`Command failed: ${command} ${args.join(" ")}`, error);

    const finalError =
      error instanceof Error ? error : new Error(String(error));

    if (throwOnError) throw finalError;

    return {
      success: false,
      error: finalError,
      output: execError.stdout ?? execError.stderr,
      exitCode: execError.exitCode,
    };
  }
}
