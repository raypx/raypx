import { getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vite-plus/test";
import * as runtime from "./schema.js";
import * as migrations from "./schema/migrations.js";

const retiredTables = ["audit_events", "cloud_notifications", "cloud_preferences", "outbox_events"];

function tableNames(exports: Record<string, unknown>) {
  return Object.values(exports)
    .filter((value) => is(value, PgTable))
    .map(getTableName)
    .sort();
}

describe("database schema boundaries", () => {
  it("exposes all active tables without retired compatibility tables", () => {
    const active = tableNames(runtime.schema);
    expect(active).toHaveLength(33);
    expect(tableNames(runtime)).toEqual(active);
    expect(active.filter((name) => retiredTables.includes(name))).toEqual([]);
    expect(Object.values(runtime.schema).every((table) => is(table, PgTable))).toBe(true);
  });

  it("keeps retired tables in the physical migration schema", () => {
    const physical = tableNames(migrations);
    expect(physical).toHaveLength(37);
    expect(physical).toEqual([...tableNames(runtime.schema), ...retiredTables].sort());
    expect(migrations.auditActionEnum.enumName).toBe("audit_action");
    expect(migrations.auditTargetTypeEnum.enumName).toBe("audit_target_type");
  });

  it("keeps Better Auth relations complete and limited to authentication", () => {
    const { relations } = runtime;
    expect(Object.keys(relations).sort()).toEqual([
      "authAccounts",
      "authSessions",
      "authVerifications",
      "users",
    ]);
    expect(Object.keys(relations.users.relations).sort()).toEqual(["authAccounts", "authSessions"]);
    for (const [relation, table] of [
      [relations.authSessions.relations.user, runtime.authSessions],
      [relations.authAccounts.relations.user, runtime.authAccounts],
    ] as const) {
      expect(relation.sourceTable).toBe(table);
      expect(relation.targetTable).toBe(runtime.users);
      expect(relation.optional).toBe(false);
    }
    expect(relations.authVerifications.table).toBe(runtime.authVerifications);
  });
});
