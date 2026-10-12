import { defineCommand } from "citty";

import { runCliAction } from "../runtime/action.js";

export const policyCommand = defineCommand({
  meta: {
    name: "policy",
    description:
      "Check workspace AGENTS.md structure, documentation links, skill wiring, ignore rules, package manifests, and TypeScript presets",
  },
  args: {
    fix: {
      type: "boolean",
      default: false,
      description: "Rewrite the findings that have exactly one possible remedy",
    },
  },
  async run({ args }) {
    await runCliAction("policy", async () => {
      const [
        { createPolicyDependencies },
        { renderPolicyReport },
        { runPolicy },
        { applyPolicyFixes },
        { runCommand },
      ] = await Promise.all([
        import("./runtime.js"),
        import("./report.js"),
        import("./checks.js"),
        import("./fixes.js"),
        import("../runtime/process.js"),
      ]);
      const dependencies = createPolicyDependencies();

      if (args.fix) {
        const changed = await applyPolicyFixes(dependencies);
        if (changed.length > 0) {
          // A fixer that rewrites JSON cannot also be the authority on how JSON
          // is formatted — Oxfmt is, and it keeps a short array inline where
          // JSON.stringify would expand it. Handing the rewritten files back
          // stops `--fix` from leaving the tree failing `vp fmt --check`.
          await runCommand(["vp", "fmt", ...changed], { cwd: dependencies.repositoryRoot });
        }
        console.log(
          changed.length === 0
            ? "Policy: nothing to fix."
            : `Policy: rewrote ${changed.length} files:\n${changed.map((file) => `  ${file}`).join("\n")}`,
        );
      }

      // The report is printed after the fixes, so what remains is what needs a
      // person. A fix that did not take shows up here rather than being claimed.
      const report = await runPolicy(dependencies);
      console.log(renderPolicyReport(report));
      if (report.errors > 0) process.exitCode = 1;
    });
  },
});
