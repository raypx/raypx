import { defineCommand } from "citty";

export const rootCommand = defineCommand({
  meta: {
    name: "vmx",
    version: "0.0.0",
    description: "Voidmix repository automation",
  },
  subCommands: {
    // cli.ts intercepts tasks to preserve Turbo flags without Citty parsing.
    tasks: defineCommand({
      meta: { name: "tasks", description: "Run the Turbo workspace task graph" },
    }),
    env: () => import("./commands/env.js").then(({ envCommand }) => envCommand),
    doctor: () => import("./doctor/command.js").then(({ doctorCommand }) => doctorCommand),
    deps: () => import("./deps/command.js").then(({ depsCommand }) => depsCommand),
    skills: () => import("./skills/command.js").then(({ skillsCommand }) => skillsCommand),
    policy: () => import("./policy/command.js").then(({ policyCommand }) => policyCommand),
    i18n: () => import("./i18n/command.js").then(({ i18nCommand }) => i18nCommand),
    clean: () => import("./commands/clean.js").then(({ cleanCommand }) => cleanCommand),
    db: () => import("./database/command.js").then(({ databaseCommand }) => databaseCommand),
    admin: () => import("./admin/command.js").then(({ adminCommand }) => adminCommand),
    generate: () => import("./commands/generate.js").then(({ generateCommand }) => generateCommand),
    desktop: () => import("./commands/desktop.js").then(({ desktopCommand }) => desktopCommand),
    verify: () => import("./commands/verify.js").then(({ verifyCommand }) => verifyCommand),
    shadcn: () => import("./commands/shadcn.js").then(({ shadcnCommand }) => shadcnCommand),
  },
});
