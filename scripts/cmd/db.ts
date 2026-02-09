/**
 * Database management commands
 * Unified interface for managing main and vector databases
 */

import { x } from "tinyexec";
import { defineCommand } from "../lib/task";
import { logger } from "../utils/logger";

type DatabaseType = "main" | "vector" | "all";
type DbOperation = "generate" | "push" | "migrate" | "studio";

const DB_COMMANDS = {
  main: {
    generate: [
      "raypx-scripts",
      "run",
      "drizzle-kit",
      "generate",
      "--config=config/drizzle.config.ts",
    ],
    push: ["raypx-scripts", "run", "drizzle-kit", "push", "--config=config/drizzle.config.ts"],
    migrate: [
      "raypx-scripts",
      "run",
      "drizzle-kit",
      "migrate",
      "--config=config/drizzle.config.ts",
    ],
    studio: ["raypx-scripts", "run", "drizzle-kit", "studio", "--config=config/drizzle.config.ts"],
  },
  vector: {
    generate: [
      "raypx-scripts",
      "run",
      "drizzle-kit",
      "generate",
      "--config=config/drizzle-vector.config.ts",
    ],
    push: [
      "raypx-scripts",
      "run",
      "drizzle-kit",
      "push",
      "--config=config/drizzle-vector.config.ts",
    ],
    migrate: [
      "raypx-scripts",
      "run",
      "drizzle-kit",
      "migrate",
      "--config=config/drizzle-vector.config.ts",
    ],
    studio: [
      "raypx-scripts",
      "run",
      "drizzle-kit",
      "studio",
      "--config=config/drizzle-vector.config.ts",
    ],
  },
} as const;

async function runDbCommand(
  dbType: DatabaseType,
  operation: DbOperation,
  cwd: string,
): Promise<void> {
  if (dbType === "all") {
    // Run for both databases sequentially
    logger.info(`Running ${operation} for main database...`);
    await runDbCommand("main", operation, cwd);
    logger.info(`Running ${operation} for vector database...`);
    await runDbCommand("vector", operation, cwd);
    return;
  }

  const commands = DB_COMMANDS[dbType];
  const command = commands[operation];
  const dbName = dbType === "main" ? "main" : "vector";

  if (!command || !command[0]) {
    throw new Error(`Invalid command for ${dbType} ${operation}`);
  }

  logger.info(`Executing ${operation} for ${dbName} database...`);

  // Use raypx-scripts run to execute drizzle-kit (same as package.json scripts)
  // This ensures drizzle-kit is found in node_modules
  const [cmd, ...args] = command;
  const result = await x(cmd, args, {
    nodeOptions: {
      cwd,
      env: process.env,
      stdio: "inherit",
      shell: true, // Use shell to resolve commands
    },
    throwOnError: false,
  });

  if (result.exitCode !== 0) {
    throw new Error(`Failed to ${operation} ${dbName} database. Exit code: ${result.exitCode}`);
  }
}

const dbCmd = defineCommand({
  cmd: "db <operation> [database]",
  description: "Database management commands",
  help: `Manage database migrations and operations.

Operations:
  generate  - Generate migration files (does not execute)
  push      - Push schema directly to database (development, no migration files)
  migrate   - Execute migration files (production)
  studio    - Open Drizzle Studio GUI

Database types:
  main      - Main database (default)
  vector    - Vector database
  all       - Both databases (for generate/push/migrate)

Examples:
  raypx-scripts db generate main      - Generate main database migrations
  raypx-scripts db push vector        - Push vector database schema
  raypx-scripts db migrate all        - Migrate both databases
  raypx-scripts db studio main        - Open main database studio
  raypx-scripts db generate            - Generate main database (default)`,
  examples: [
    "raypx-scripts db generate main",
    "raypx-scripts db push vector",
    "raypx-scripts db migrate all",
    "raypx-scripts db studio main",
  ],
  run: async (args?: string[]) => {
    if (!args || args.length === 0) {
      logger.error("Missing operation. Usage: raypx-scripts db <operation> [database]");
      logger.log("\nOperations: generate, push, migrate, studio");
      logger.log("Databases: main (default), vector, all");
      process.exit(1);
    }

    const operation = args[0] as DbOperation;
    const dbType = (args[1] || "main") as DatabaseType;

    // Validate operation
    const validOperations: DbOperation[] = ["generate", "push", "migrate", "studio"];
    if (!validOperations.includes(operation)) {
      logger.error(`Invalid operation: ${operation}`);
      logger.log(`Valid operations: ${validOperations.join(", ")}`);
      process.exit(1);
    }

    // Validate database type
    const validDbTypes: DatabaseType[] = ["main", "vector", "all"];
    if (!validDbTypes.includes(dbType)) {
      logger.error(`Invalid database type: ${dbType}`);
      logger.log(`Valid types: ${validDbTypes.join(", ")}`);
      process.exit(1);
    }

    // Studio doesn't support "all"
    if (operation === "studio" && dbType === "all") {
      logger.error("Studio command doesn't support 'all'. Please specify 'main' or 'vector'.");
      process.exit(1);
    }

    // Get database package directory
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    const projectRoot = join(__dirname, "../..");
    const dbPackageDir = join(projectRoot, "packages/database");

    try {
      await runDbCommand(dbType, operation, dbPackageDir);
      logger.success(`✓ Database ${operation} completed for ${dbType}`);
    } catch (error) {
      logger.error(`✗ Database ${operation} failed for ${dbType}`, error);
      process.exit(1);
    }
  },
});

export default dbCmd;
