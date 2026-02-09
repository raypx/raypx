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

/**
 * Execute command with type-safe arguments
 *
 * @param command - Command to execute (e.g., "bun", "npm", "node")
 * @param args - Array of arguments (e.g., ["build", "--watch"])
 * @param options - Execution options
 * @returns Promise with execution result
 */
export async function execCommand(
  command: string,
  args: string[] = [],
  options: ExecOptions = {},
): Promise<ExecResult> {
  const { cwd = PROJECT_ROOT, timeout = 180_000, env = {}, throwOnError = false } = options;

  logger.debug(`Executing: ${command} ${args.join(" ")}`);

  try {
    const result = await x(command, args, {
      nodeOptions: {
        cwd,
        env: {
          ...process.env,
          NPM_CONFIG_LOGLEVEL: "error",
          ...env,
        },
      },
      timeout,
      throwOnError: false, // Handle errors manually for consistent API
    });

    // Check exit code manually
    if (result.exitCode !== 0) {
      const errorMessage = `Command exited with code ${result.exitCode}`;
      console.error(result.stderr);
      const error = new Error(errorMessage);

      if (throwOnError) {
        throw error;
      }

      return {
        success: false,
        error,
        output: result.stderr || result.stdout,
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
      message?: string;
    };

    logger.debug(`Command failed: ${command} ${args.join(" ")}`, error);

    const finalError = error instanceof Error ? error : new Error(String(error));

    if (throwOnError) {
      throw finalError;
    }

    return {
      success: false,
      error: finalError,
      output: execError.stdout || execError.stderr,
      exitCode: execError.exitCode,
    };
  }
}

/**
 * Execute command from a command string
 *
 * @deprecated Use execCommand(cmd, args[]) instead for better type safety and proper argument handling
 *
 * @param commandString - Command string (e.g., "bun run build")
 * @param options - Execution options
 * @returns Promise with execution result
 *
 * @warning This function uses a simple split on whitespace and does NOT handle:
 * - Quoted arguments: "echo 'hello world'" will be split incorrectly
 * - Escaped characters: "echo \"test\"" will include the quotes
 * - Complex shell syntax: pipes, redirects, etc.
 *
 * For complex commands, use execCommand with properly parsed arguments.
 */
export async function safeExecAsync(
  commandString: string,
  options: ExecOptions = {},
): Promise<ExecResult> {
  // Simple split on whitespace - does NOT handle quotes or escapes
  // This is intentionally naive for backward compatibility
  const parts = commandString.trim().split(/\s+/);
  const [cmd, ...args] = parts;

  if (!cmd) {
    return {
      success: false,
      error: new Error("Empty command string"),
    };
  }

  return execCommand(cmd, args, options);
}
