import { defineCommand } from "citty";
import { installedCommands } from "../lib/cli/bootstrap.ts";

export default defineCommand({
  meta: { name: "consumer", description: installedCommands.consumer.description },
  args: {
    kind: {
      type: "enum",
      options: ["all", "core", "server", "browser"],
      default: "all",
      description: "Consumer to validate; all runs core, server, then browser.",
    },
  },
  async run({ args }) {
    const { prepareConsumer } = await import("../lib/consumer/prepare.ts");
    await prepareConsumer();
    const { runConsumers } = await import("../lib/consumer/run.ts");
    await runConsumers(args.kind);
  },
});
