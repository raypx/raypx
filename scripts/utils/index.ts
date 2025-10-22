import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { logger } from "@raypx/shared/logger";
import { execaCommand, type Options } from "execa";

/**
 * Path utilities
 */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** Project root directory (monorepo root) */
export const PROJECT_ROOT = resolve(__dirname, "../../");

/**
 * Formats duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60_000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  return `${minutes}m ${seconds}s`;
}

/**
 * Allowed command prefixes for this project
 */
const ALLOWED_COMMANDS = ["pnpm", "node", "tsx", "tsc", "biome", "git", "du", "vite"] as const;

/**
 * Additional dangerous patterns to block
 */
const DANGEROUS_PATTERNS = [
  /rm\s+-rf?\s+\//, // rm -rf /
  /sudo/, // sudo commands
  /chmod\s+777/, // dangerous permissions
  /eval\s*\(/, // eval injection
  />\s*\/dev\//, // writing to devices
  /curl.*\|\s*sh/, // pipe to shell
  /wget.*\|\s*sh/, // pipe to shell
  /npm\s+install\s+-g/, // global npm installs
  /yarn/, // yarn commands
  /npx/, // npx commands
] as const;

/**
 * Validates if a command is safe to execute
 */
function validateCommand(command: string): boolean {
  const trimmedCmd = command.trim();
  if (!trimmedCmd) {
    return false;
  }

  // Extract the base command (first word)
  const baseCommand = trimmedCmd.split(/\s+/)[0];
  if (!baseCommand) {
    return false;
  }

  // Check if command is in whitelist
  const isAllowed = ALLOWED_COMMANDS.some(
    (cmd) => baseCommand === cmd || baseCommand.startsWith(`${cmd}/`),
  );

  if (!isAllowed) {
    return false;
  }

  // Check for dangerous patterns
  return !DANGEROUS_PATTERNS.some((pattern) => pattern.test(trimmedCmd));
}

/**
 * Safely executes a shell command asynchronously with security validation and better error handling
 */
export async function safeExecAsync(
  command: string,
  options?: Options,
): Promise<{ success: boolean; error?: Error; output?: string }> {
  // Validate command for security
  if (!validateCommand(command)) {
    const error = new Error(`Potentially dangerous command blocked: ${command}`);
    logger.error(error.message);
    return { success: false, error };
  }

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

export * from "./component-exports";
