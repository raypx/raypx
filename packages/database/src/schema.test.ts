import { expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { schema, user } from "./schema.js";

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
