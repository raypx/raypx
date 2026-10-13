/**
 * @license MIT, Copyright (c) Alec Larson.
 * Adapted from alloc/drizzle-plus at 5840bdb4c5b3c7526b7db132f0b14cbe8a89eae9.
 * Modified for Raypx: explicit functions and update keys, without prototype extensions.
 * Full license and source references: ../../third-party/NOTICE.md.
 */
import { getColumns, sql, type SQL, type Table } from "drizzle-orm";

type Columns<T extends Table> = T["_"]["columns"];

export function withoutColumns<T extends Table, K extends keyof Columns<T>>(
  table: T,
  ...keys: K[]
): Omit<Columns<T>, K> {
  const columns = { ...getColumns(table) };
  for (const key of keys) delete columns[key];
  return columns;
}

export function excludedColumn(name: string): SQL {
  return sql`excluded.${sql.identifier(name)}`;
}

export function excludedColumns<T extends Table, K extends keyof Columns<T>>(
  table: T,
  ...keys: K[]
): Record<K, SQL> {
  const columns = getColumns(table);
  return Object.fromEntries(
    keys.map((key) => {
      const column = columns[key];
      if (!column) throw new Error(`Unknown update column: ${String(key)}.`);
      return [key, excludedColumn(column.name)];
    }),
  ) as Record<K, SQL>;
}
