import { expect, it } from "vite-plus/test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { schema, user } from "./schema.js";

it("uses the isolated foundation schema with Better Auth Admin fields", () => {
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
  expect(config.schema).toBe("raypx_foundation");
  expect(config.columns.map((c) => c.name)).toContain("name");
  expect(config.columns.map((c) => c.name)).toEqual(
    expect.arrayContaining(["role", "banned", "ban_reason", "ban_expires"]),
  );
});
