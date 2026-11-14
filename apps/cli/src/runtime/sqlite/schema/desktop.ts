import { sql } from "drizzle-orm";
import { blob, check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

/** Desktop session cookies share the profile writer; payloads are authenticated ciphertext. */
export const desktopSessions = sqliteTable(
  "desktop_sessions",
  {
    origin: text("origin").primaryKey(),
    version: integer("version").notNull(),
    encrypted: blob("encrypted", { mode: "buffer" }).notNull(),
  },
  (table) => [
    check("desktop_session_version", sql`${table.version} > 0`),
    check("desktop_session_size", sql`length(${table.encrypted}) BETWEEN 28 AND 262172`),
  ],
);
