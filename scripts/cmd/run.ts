import { execSync } from "node:child_process";
import path from "node:path";
import dotenvx from "@dotenvx/dotenvx";
import { definedCmd } from "../lib/task";
import { PROJECT_ROOT } from "../utils";

const runCmd = definedCmd({
  run: async (args?: string[]) => {
    if (!args?.length) {
      throw new Error("No arguments provided");
    }
    const envs = dotenvx.config({ path: path.join(PROJECT_ROOT, ".env") });
    execSync(args.join(" "), {
      cwd: process.cwd(),
      env: {
        ...process.env,
        ...envs.parsed,
      },
      stdio: "inherit",
    });
  },
  type: "run",
});

export default runCmd;
