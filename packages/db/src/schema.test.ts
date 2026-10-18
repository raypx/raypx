import { expect, it } from "vite-plus/test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { schema, user } from "./schema.js";

it("uses a new auth-only schema without legacy role admission", () => {
  expect(Object.keys(schema)).toEqual(["user", "session", "account", "verification"]);
  const config = getTableConfig(user);
  expect(config.schema).toBe("raypx_foundation");
  expect(config.columns.map((c) => c.name)).toContain("name");
  expect(config.columns.map((c) => c.name)).not.toContain("role");
});
