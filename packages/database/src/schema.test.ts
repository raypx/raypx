import { expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { computers, conversationEvents, schema, user } from "./schema.js";

it("uses the public schema with Better Auth Admin fields", () => {
  expect(Object.keys(schema)).toEqual(
    expect.arrayContaining([
      "user",
      "session",
      "account",
      "verification",
      "controlDevice",
      "controlTask",
      "controlRequest",
    ]),
  );
  const config = getTableConfig(user);
  expect(config.schema).toBeUndefined();
  expect(config.columns.map((c) => c.name)).toContain("name");
  expect(config.columns.map((c) => c.name)).toEqual(
    expect.arrayContaining(["role", "banned", "ban_reason", "ban_expires"]),
  );
});

it("keeps Computer references fenced by the same Space in the database metadata", () => {
  for (const table of [computers, conversationEvents]) {
    const foreignKeys = getTableConfig(table).foreignKeys.map((key) => key.reference());
    for (const reference of foreignKeys.filter((key) =>
      key.columns.some((column) =>
        ["agent_id", "created_by_account_id", "computer_id"].includes(column.name),
      ),
    )) {
      expect(reference.columns[0]?.name).toBe("space_id");
      expect(reference.foreignColumns[0]?.name).toBe("space_id");
      expect(reference.columns).toHaveLength(2);
    }
  }
  const indexes = getTableConfig(computers).indexes;
  expect(
    indexes.some(
      (index) =>
        index.config.name === "computers_team_idx" &&
        index.config.unique &&
        index.config.where !== undefined,
    ),
  ).toBe(true);
});
