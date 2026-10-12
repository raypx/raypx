import { defineCommand } from "citty";

import { contextualCommand } from "../runtime/command.js";

const migrateCommand = contextualCommand("db migrate", "database", {
  meta: { name: "migrate", description: "Apply database migrations" },
  async run(context) {
    const [{ runMigrate }, { migrateDatabase }] = await Promise.all([
      import("./operation.js"),
      import("@voidmix/db"),
    ]);
    await runMigrate(context.environment, {
      log: context.log,
      migrate: migrateDatabase,
    });
  },
});

const cleanCommand = contextualCommand("db clean", "database", {
  meta: { name: "clean", description: "Drop every table in a development or test database" },
  async run(context) {
    const [{ runClean }, { resetDatabase }] = await Promise.all([
      import("./operation.js"),
      import("@voidmix/db"),
    ]);
    await runClean(context.environment, { log: context.log, reset: resetDatabase });
  },
});

const pushCommand = contextualCommand("db push", "database", {
  meta: { name: "push", description: "Push the schema straight to a local database" },
  async run(context, { rawArgs }) {
    const { runPush } = await import("./operation.js");
    await runPush(context.environment, context, rawArgs);
  },
});

const studioCommand = contextualCommand("db studio", "database", {
  meta: { name: "studio", description: "Open Drizzle Studio for a local database" },
  async run(context) {
    const { runStudio } = await import("./operation.js");
    await runStudio(context.environment, context);
  },
});

export const databaseCommand = defineCommand({
  meta: { name: "db", description: "Manage the Voidmix database" },
  subCommands: {
    clean: cleanCommand,
    migrate: migrateCommand,
    push: pushCommand,
    studio: studioCommand,
  },
});
