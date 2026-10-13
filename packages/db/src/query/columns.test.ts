import { getColumns } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { v2ProjectMembers } from "../schema.js";
import { excludedColumn, excludedColumns, withoutColumns } from "./columns.js";

describe("typed column helpers", () => {
  it("omits metadata without mutating the table or losing column types", () => {
    const projection = withoutColumns(v2ProjectMembers, "id", "createdAt", "updatedAt");
    expect(Object.keys(projection).sort()).toEqual(["projectId", "role", "status", "userId"]);
    expect(projection.projectId).toBe(v2ProjectMembers.projectId);
    expect(getColumns(v2ProjectMembers).id).toBe(v2ProjectMembers.id);
    expectTypeOf(projection).toEqualTypeOf<
      Omit<(typeof v2ProjectMembers)["_"]["columns"], "id" | "createdAt" | "updatedAt">
    >();
  });

  it("maps only the chosen update keys to physical PostgreSQL column names", () => {
    const update = excludedColumns(v2ProjectMembers, "role", "status", "updatedAt");
    expect(Object.keys(update).sort()).toEqual(["role", "status", "updatedAt"]);
    expect(new PgDialect().sqlToQuery(update.updatedAt)).toEqual({
      sql: 'excluded."updated_at"',
      params: [],
    });
    expectTypeOf(update).toHaveProperty("updatedAt");
    expectTypeOf(update).not.toHaveProperty("id");
  });

  it("quotes identifiers rather than accepting SQL fragments", () => {
    expect(new PgDialect().sqlToQuery(excludedColumn('role"; drop table users; --'))).toEqual({
      sql: 'excluded."role""; drop table users; --"',
      params: [],
    });
  });
});
