import { defineCommand } from "citty";

import { contextualCommand } from "../runtime/command.js";

const updateCommand = contextualCommand("skills update", "process", {
  meta: { name: "update", description: "Update installed repository skills" },
  async run(context) {
    const { runSkillsUpdate } = await import("./operations.js");
    await runSkillsUpdate(context);
  },
});

export const skillsCommand = defineCommand({
  meta: { name: "skills", description: "Manage repository skills" },
  subCommands: { update: updateCommand },
});
