import {
  bigint,
  boolean,
  index,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  integer,
  jsonb,
  primaryKey,
} from "drizzle-orm/pg-core";
import { defineRelations } from "drizzle-orm";

export const foundation = pgSchema("raypx_foundation");
const date = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const timestamps = () => ({
  createdAt: date("created_at").notNull().defaultNow(),
  updatedAt: date("updated_at").notNull().defaultNow(),
});
export const user = foundation.table("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  ...timestamps(),
});
export const session = foundation.table(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: date("expires_at").notNull(),
    token: text("token").notNull().unique(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    ...timestamps(),
  },
  (table) => [
    index("session_user_id_idx").on(table.userId),
    index("session_expires_at_idx").on(table.expiresAt),
  ],
);
export const account = foundation.table(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: date("access_token_expires_at"),
    refreshTokenExpiresAt: date("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    ...timestamps(),
  },
  (table) => [
    index("account_user_id_idx").on(table.userId),
    uniqueIndex("account_provider_account_idx").on(table.providerId, table.accountId),
  ],
);
export const verification = foundation.table(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: date("expires_at").notNull(),
    ...timestamps(),
  },
  (table) => [
    index("verification_identifier_idx").on(table.identifier),
    index("verification_expires_at_idx").on(table.expiresAt),
  ],
);

// Better Auth and API RPC limits share this table; keys are IP/path or rpc:<user>:<procedure>.
export const rateLimit = foundation.table(
  "rate_limit",
  {
    id: text("id").primaryKey(),
    key: text("key").notNull().unique(),
    count: integer("count").notNull(),
    lastRequest: bigint("last_request", { mode: "number" }).notNull(),
  },
  (table) => [index("rate_limit_last_request_idx").on(table.lastRequest)],
);

// Control records are separate from authentication and never contain CLI credentials.
export const controlOwner = foundation.table("control_owner", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
});
const controlRecord = (name: string) =>
  foundation.table(
    name,
    {
      id: text("id").notNull(),
      userId: text("user_id")
        .notNull()
        .references(() => user.id, { onDelete: "cascade" }),
      deviceId: text("device_id").notNull(),
      body: jsonb("body").notNull(),
    },
    (table) => [
      primaryKey({ columns: [table.userId, table.id] }),
      index(`${name}_device_idx`).on(table.userId, table.deviceId),
    ],
  );
export const controlDevice = controlRecord("control_device");
export const controlProject = controlRecord("control_project");
export const controlTask = controlRecord("control_task");
export const controlRequest = controlRecord("control_request");
export const controlEvent = controlRecord("control_event");
export const controlCommand = controlRecord("control_command");
export const controlGrant = controlRecord("control_grant");

export const schema = {
  user,
  session,
  account,
  verification,
  rateLimit,
  controlOwner,
  controlDevice,
  controlProject,
  controlTask,
  controlRequest,
  controlEvent,
  controlCommand,
  controlGrant,
};
export const relations = defineRelations(schema, (r) => ({
  user: {
    sessions: r.many.session({ from: r.user.id, to: r.session.userId }),
    accounts: r.many.account({ from: r.user.id, to: r.account.userId }),
  },
  session: { user: r.one.user({ from: r.session.userId, to: r.user.id, optional: false }) },
  account: { user: r.one.user({ from: r.account.userId, to: r.user.id, optional: false }) },
}));
