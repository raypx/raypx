import { runContextualAction } from "../runtime/action.js";
import { runE2e } from "./operation.js";

export async function runE2eCommand(args: readonly string[]): Promise<void> {
  await runContextualAction("e2e", "process", async (context) => {
    const { runCommand } = await import("../runtime/process.js");
    await runE2e({ ...context, runCommand }, args);
  });
}
