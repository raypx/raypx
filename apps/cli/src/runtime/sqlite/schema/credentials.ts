import { sql } from "drizzle-orm";
import { blob, check, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const instanceCredentials = sqliteTable(
  "instance_credentials",
  {
    instanceId: text("instance_id").primaryKey(),
    privateKey: blob("private_key", { mode: "buffer" }).notNull(),
  },
  (table) => [check("instance_key_size", sql`length(${table.privateKey}) BETWEEN 1 AND 4096`)],
);

export const hostAuthorizations = sqliteTable(
  "host_authorizations",
  {
    apiUrl: text("api_url").notNull(),
    accountId: text("account_id").notNull(),
    deviceId: text("device_id").notNull(),
    epoch: integer("epoch").notNull(),
    authorization: text("authorization").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.apiUrl, table.accountId, table.deviceId, table.epoch] }),
    check("host_epoch_positive", sql`${table.epoch} > 0`),
  ],
);
