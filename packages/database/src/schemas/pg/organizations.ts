import { index, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { pgTable, uuidv7 } from "../../utils";

/**
 * Organization table
 * Organizations are separate from auth but used by auth (members)
 */
export const organization = pgTable(
  "organization",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
    slug: text("slug").unique(),
    logo: text("logo"),
    createdAt: timestamp("created_at")
      .notNull()
      .$defaultFn(() => /* @__PURE__ */ new Date()),
    updatedAt: timestamp("updated_at")
      .notNull()
      .$defaultFn(() => /* @__PURE__ */ new Date())
      .$onUpdateFn(() => /* @__PURE__ */ new Date()),
    metadata: text("metadata"),
  },
  (table) => [index("idx_organization_slug").on(table.slug)],
);

/**
 * Relations are defined in the files that use this table:
 * - auth.ts: member, invitation relations
 */
