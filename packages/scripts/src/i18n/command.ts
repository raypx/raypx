import { defineCommand } from "citty";

import { runCliAction } from "../runtime/action.js";

export const i18nCommand = defineCommand({
  meta: {
    name: "i18n",
    description: "Check locale catalog parity and user-facing translation boundaries",
  },
  async run() {
    await runCliAction("i18n", async () => {
      const [{ createI18nDependencies, runI18nCheck }, { renderI18nReport }] = await Promise.all([
        import("./runtime.js"),
        import("./report.js"),
      ]);
      const report = await runI18nCheck(createI18nDependencies());
      console.log(renderI18nReport(report));
      if (report.errors > 0) process.exitCode = 1;
    });
  },
});
