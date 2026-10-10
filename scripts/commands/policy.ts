import { fileURLToPath } from "node:url";
import { defineCommand } from "citty";
import { installedCommands } from "../lib/cli/bootstrap.ts";

export default defineCommand({
  meta: { name: "policy", description: installedCommands.policy.description },
  args: { json: { type: "boolean", description: "Print only a JSON policy report" } },
  async run({ args }) {
    const [{ runPolicy }, { policyReport, renderPolicyReport }] = await Promise.all([
      import("../lib/policy/checks.ts"),
      import("../lib/policy/report.ts"),
    ]);
    let report;
    try {
      report = await runPolicy(fileURLToPath(new URL("../../", import.meta.url)));
    } catch {
      report = policyReport([
        {
          rule: "policy.runtime",
          path: ".",
          message: "Policy could not inspect the repository.",
          fix: "Run from a readable Git checkout with Git available and installed tooling dependencies.",
        },
      ]);
    }
    console.log(args.json ? JSON.stringify(report) : renderPolicyReport(report));
    if (report.errors) process.exitCode = 1;
  },
});
