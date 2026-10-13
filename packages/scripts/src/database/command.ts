import { defineCommand } from "citty";

import { contextualCommand } from "../runtime/command.js";

const migrateCommand = contextualCommand("db migrate", "database", {
  meta: { name: "migrate", description: "Apply database migrations" },
  async run(context) {
    const [{ runMigrate }, { migrateDatabase }] = await Promise.all([
      import("./operation.js"),
      import("@raypx/db"),
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
      import("@raypx/db"),
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

const explainCommand = contextualCommand("db explain", "database", {
  meta: { name: "explain", description: "Explain a known Raypx query in development or test" },
  args: {
    query: {
      type: "string",
      default: "queued-runs",
      description: "queued-runs, expired-runs, account-usage, or visible-projects",
    },
    analyze: {
      type: "boolean",
      default: false,
      description: "Execute the read-only query and collect timings",
    },
    buffers: {
      type: "boolean",
      default: false,
      description: "Collect buffer counters; requires --analyze",
    },
    limit: { type: "string", description: "Maximum rows for Run and project queries (1–100)" },
    "account-id": { type: "string", description: "Account for the account-usage query" },
    "actor-id": { type: "string", description: "Actor for the visible-projects query" },
    from: {
      type: "string",
      description: "Account-usage start as an ISO timestamp with a timezone",
    },
    until: { type: "string", description: "Account-usage end as an ISO timestamp with a timezone" },
    now: {
      type: "string",
      description: "Expired-runs reference time as an ISO timestamp with a timezone",
    },
    "timeout-ms": {
      type: "string",
      description: "Statement timeout in milliseconds (1–30000; default 5000)",
    },
    "lock-timeout-ms": {
      type: "string",
      description: "Lock timeout in milliseconds (1–5000; default 1000)",
    },
    json: { type: "boolean", default: false, description: "Print the safe plan summary as JSON" },
  },
  async run(context, { args }) {
    const [{ runExplain }, { createExplainDependencies }, { renderExplainReport }] =
      await Promise.all([
        import("./explain.js"),
        import("./explain-runtime.js"),
        import("./explain-report.js"),
      ]);
    const report = await runExplain(context.environment, args, await createExplainDependencies());
    console.log(renderExplainReport(report, args.json));
  },
});

export const databaseCommand = defineCommand({
  meta: { name: "db", description: "Manage the Raypx database" },
  subCommands: {
    clean: cleanCommand,
    explain: explainCommand,
    migrate: migrateCommand,
    push: pushCommand,
    studio: studioCommand,
  },
});
