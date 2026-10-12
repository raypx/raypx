import { text, timestamp, type AnyPgColumn, type ReferenceConfig } from "drizzle-orm/pg-core";

export const dateColumn = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
export const createdAt = () => dateColumn("created_at").notNull().defaultNow();
export const updatedAt = () =>
  dateColumn("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
export const timestamps = () => ({ createdAt: createdAt(), updatedAt: updatedAt() });
export const requiredReference = (
  name: string,
  reference: () => AnyPgColumn,
  onDelete: NonNullable<ReferenceConfig["config"]["onDelete"]>,
) => text(name).notNull().references(reference, { onDelete });
