import { defineRelations } from "drizzle-orm";
import { schema } from "./tables.js";

// Repository adapters use explicit joins. Better Auth alone uses relational queries.
export const relations = defineRelations(schema, (r) => ({
  users: {
    authSessions: r.many.authSessions({ from: r.users.id, to: r.authSessions.userId }),
    authAccounts: r.many.authAccounts({ from: r.users.id, to: r.authAccounts.userId }),
  },
  authSessions: {
    user: r.one.users({ from: r.authSessions.userId, to: r.users.id, optional: false }),
  },
  authAccounts: {
    user: r.one.users({ from: r.authAccounts.userId, to: r.users.id, optional: false }),
  },
}));
