import path from "node:path";
import dotenvx from "@dotenvx/dotenvx";
import { execaCommand } from "execa";
import { definedCmd } from "../lib/task";
import { PROJECT_ROOT } from "../utils";

const runCmd = definedCmd({
  run: async (args?: string[]) => {
    if (!args?.length) {
      throw new Error("No arguments provided");
    }

    const envConfig = dotenvx.config({ path: path.join(PROJECT_ROOT, ".env"), quiet: true });
    try {
      await execaCommand(args.join(" "), {
        cwd: process.cwd(),
        env: { ...process.env, ...envConfig.parsed },
        stdio: "inherit",
        shell: true,
      });
    } catch (error) {
      //
    }
  },
  description: "Execute commands with automatic environment variable loading",
  help: `This command automatically loads environment variables from PROJECT_ROOT/.env
before executing the specified command. This eliminates the need for package-specific
with-env script definitions.

The command uses @dotenvx/dotenvx for secure environment variable injection and
supports all standard shell commands through execa.`,
  examples: [
    "raypx-scripts run vite dev",
    "raypx-scripts run pnpm build",
    "raypx-scripts run tsc --noEmit",
    "rs run node scripts/migrate.js",
  ],
  type: "run",
  cmd: "run [args...]",
});

export default runCmd;
