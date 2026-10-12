import { defineCommand } from "citty";
import { contextualCommand } from "../runtime/command.js";

const operationNames = {
  check: "runDependencyCheck",
  update: "runDependencyUpdate",
  audit: "runAudit",
} as const;
const descriptions = {
  check: "Check for compatible dependency updates",
  update: "Write compatible dependency updates and refresh bun.lock",
  audit: "Audit dependencies for known vulnerabilities",
};
function operationCommand(name: keyof typeof operationNames) {
  return contextualCommand(`deps ${name}`, "repository", {
    meta: { name, description: descriptions[name] },
    async run(dependencies) {
      const operations = await import("./operations.js");
      await operations[operationNames[name]](dependencies);
    },
  });
}
export const depsCommand = defineCommand({
  meta: { name: "deps", description: "Maintain dependency resolution and security" },
  subCommands: {
    check: operationCommand("check"),
    update: operationCommand("update"),
    audit: operationCommand("audit"),
    dedupe: contextualCommand("deps dedupe", "repository", {
      meta: { name: "dedupe", description: "Remove duplicate dependency versions from bun.lock" },
      args: {
        check: {
          type: "boolean" as const,
          default: false,
          description: "Check for removable duplicates without changing bun.lock",
        },
      },
      async run(dependencies, { args }) {
        const { runDedupe } = await import("./operations.js");
        await runDedupe(dependencies, { check: args.check });
      },
    }),
  },
});
