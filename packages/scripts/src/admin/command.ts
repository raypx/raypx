import { defineCommand, type ArgsDef } from "citty";

import { contextualCommand } from "../runtime/command.js";

export const adminCreateArgs = {
  email: {
    type: "string",
    description: "Administrator email address",
    valueHint: "email",
  },
  name: {
    type: "string",
    description: "Administrator display name",
    valueHint: "name",
  },
} as const satisfies ArgsDef;

const createAdminCommand = contextualCommand("admin create", "database", {
  meta: { name: "create", description: "Create an idempotent initial administrator" },
  args: adminCreateArgs,
  async run(context, { args }) {
    const [operation, { openPostgresUsers }, domain] = await Promise.all([
      import("./operation.js"),
      import("../database/users.js"),
      import("@voidmix/application"),
    ]);
    await operation.runCreateAdmin(
      operation.resolveAdminCreateInput(args, context.environment),
      context.environment,
      {
        createAdministration: domain.createUserAdministration,
        log: context.log,
        openUsers: openPostgresUsers,
      },
    );
  },
});

export const adminCommand = defineCommand({
  meta: { name: "admin", description: "Manage Voidmix administrators" },
  subCommands: { create: createAdminCommand },
});
