/**
 * Execute arbitrary commands with environment variables from project root .env
 *
 * This command allows running any shell command with automatic access to
 * environment variables loaded by the CLI from PROJECT_ROOT/.env
 */

import { x } from "tinyexec";
import { defineCommand } from "../lib/task";

const runCmd = defineCommand({
  cmd: "run [args...]",
  description: "Execute commands with automatic environment variable loading",
  help: `Execute any command with environment variables automatically loaded from project root.

Environment variables are loaded by the CLI entry point, so all commands
executed via 'raypx-scripts run' have access to .env variables.

Common use cases:
- Database migrations: raypx-scripts run drizzle-kit migrate
- Development servers: raypx-scripts run vite dev
- Build tools: raypx-scripts run tsc --noEmit`,
  examples: [
    "raypx-scripts run drizzle-kit studio",
    "raypx-scripts run drizzle-kit generate",
    "raypx-scripts run pnpm build",
    "rs run node scripts/seed.js",
  ],
  run: async (args?: string[]) => {
    if (!args?.length) {
      throw new Error("No command provided. Usage: raypx-scripts run <command> [args...]");
    }

    const [c, ...rest] = args;
    if (!c) return;
    // Environment variables are already loaded by cli.ts
    // Just execute the command with inherited env
    await x(c, rest, {
      nodeOptions: {
        cwd: process.cwd(),
        env: process.env,
        stdio: "inherit",
        shell: true,
      },
    });
  },
});

export default runCmd;
