/**
 * Execute arbitrary commands with environment variables from project root .env
 */

import { x } from "tinyexec";
import { defineCommand } from "../lib/task";

const runCmd = defineCommand({
  cmd: "run [args...]",
  description: "Execute commands with automatic environment variable loading",
  help: `Execute any command with environment variables automatically loaded from project root.

Common use cases:
- Database migrations: raypx-scripts run drizzle-kit migrate
- Development servers: raypx-scripts run vite dev
- Build tools: raypx-scripts run tsc --noEmit`,
  examples: [
    "raypx-scripts run drizzle-kit studio",
    "raypx-scripts run drizzle-kit generate",
    "raypx-scripts run pnpm run build",
    "rs run pnpm run scripts/seed.js",
  ],
  run: async (args?: string[]) => {
    if (!args?.length) {
      throw new Error("No command provided. Usage: raypx-scripts run <command> [args...]");
    }

    const [cmd, ...rest] = args;
    if (!cmd) return;

    await x(cmd, rest, {
      nodeOptions: {
        cwd: process.cwd(),
        env: {
          ...process.env,
          CLI_START_TIME: Date.now().toString(),
        },
        stdio: "inherit",
        shell: true,
      },
      throwOnError: true,
    });
  },
});

export default runCmd;
