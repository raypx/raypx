import { expect, it } from "vite-plus/test";
import { getTableConfig } from "drizzle-orm/pg-core";
import { schema, user } from "../src/schema.js";

it("uses an isolated foundation schema without legacy role admission", () => {
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
  expect(config.columns.map((c) => c.name)).not.toContain("role");
});
