import { defineCommand } from "citty";
import { installedCommands } from "../lib/cli/bootstrap.ts";

export default defineCommand({
  meta: {
    name: "consumer-browser",
    description: installedCommands["consumer-browser"].description,
  },
  async run() {
    const { prepareConsumer } = await import("../lib/consumer/prepare.ts");
    await prepareConsumer();
    const [{ buildBrowser, testBrowser }, { createFixture }] = await Promise.all([
      import("../lib/consumer/browser.ts"),
      import("../lib/consumer/fixture.ts"),
    ]);
    const fixture = await createFixture("browser");
    try {
      await buildBrowser(fixture);
      await testBrowser(fixture);
    } finally {
      await fixture.cleanup();
    }
  },
});
