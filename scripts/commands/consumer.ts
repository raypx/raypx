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
    const [
      { buildBrowser, buildCoreBrowser },
      { createFixture },
      { checkRuntime },
      { checkTypes },
    ] = await Promise.all([
      import("../lib/consumer/browser.ts"),
      import("../lib/consumer/fixture.ts"),
      import("../lib/consumer/runtime.ts"),
      import("../lib/consumer/types.ts"),
    ]);
    const kinds = args.kind === "all" ? (["core", "server", "browser"] as const) : [args.kind];
    for (const kind of kinds) {
      const fixture = await createFixture(kind);
      try {
        await checkTypes(fixture);
        if (kind === "browser") await buildBrowser(fixture);
        else {
          await checkRuntime(fixture, kind === "core");
          if (kind === "core") await buildCoreBrowser(fixture);
        }
      } finally {
        await fixture.cleanup();
      }
    }
  },
});
