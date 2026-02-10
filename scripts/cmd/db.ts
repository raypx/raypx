/**
 * Database management commands
 * Unified interface for managing main and vector databases
 */

import { x } from "tinyexec";
import { defineCommand } from "../lib/task";
import { logger } from "../utils";
import { PROJECT_ROOT } from "../utils/paths";

type DatabaseType = "main" | "vector" | "all";
type DbOperation = "generate" | "push" | "migrate" | "studio";

const DB_OPERATIONS: DbOperation[] = ["generate", "push", "migrate", "studio"];
const DB_TYPES: DatabaseType[] = ["main", "vector", "all"];

const DB_CONFIGS = {
  main: "drizzle.config.ts",
  vector: "drizzle-vector.config.ts",
} as const;

// Build commands dynamically to reduce duplication
function buildDbCommand(
  operation: DbOperation,
  config: string,
): [string, ...string[]] {
  return [
    "raypx-scripts",
    "run",
    "drizzle-kit",
    operation,
    `--config=config/${config}`,
  ];
}

async function runDbCommand(
  dbType: DatabaseType,
  operation: DbOperation,
  cwd: string,
): Promise<void> {
  if (dbType === "all") {
    // Run for both databases sequentially
    for (const type of ["main", "vector"] as const) {
      logger.info(`Running ${operation} for ${type} database...`);
      await runDbCommand(type, operation, cwd);
    }
    return;
  }

  const config = DB_CONFIGS[dbType];
  const command = buildDbCommand(operation, config);

  logger.info(`Executing ${operation} for ${dbType} database...`);

  const [cmd, ...args] = command;
  const result = await x(cmd, args, {
    nodeOptions: {
      cwd,
      env: process.env,
      stdio: "inherit",
      shell: true,
    },
    throwOnError: false,
  });

  if (result.exitCode !== 0) {
    throw new Error(
      `Failed to ${operation} ${dbType} database. Exit code: ${result.exitCode}`,
    );
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
      logger.error(
        "Missing operation. Usage: raypx-scripts db <operation> [database]",
      );
      logger.log(`\nOperations: ${DB_OPERATIONS.join(", ")}`);
      logger.log(`Databases: ${DB_TYPES.join(", ")}`);
      process.exit(1);
    }

    const operation = args[0] as DbOperation;
    const dbType = (args[1] || "main") as DatabaseType;

    // Validate operation
    if (!DB_OPERATIONS.includes(operation)) {
      logger.error(`Invalid operation: ${operation}`);
      logger.log(`Valid operations: ${DB_OPERATIONS.join(", ")}`);
      process.exit(1);
    }

    // Validate database type
    if (!DB_TYPES.includes(dbType)) {
      logger.error(`Invalid database type: ${dbType}`);
      logger.log(`Valid types: ${DB_TYPES.join(", ")}`);
      process.exit(1);
    }

    // Studio doesn't support "all"
    if (operation === "studio" && dbType === "all") {
      logger.error(
        "Studio command doesn't support 'all'. Please specify 'main' or 'vector'.",
      );
      process.exit(1);
    }

    const dbPackageDir = `${PROJECT_ROOT}/packages/database`;

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
