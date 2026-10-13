import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vite-plus/test";
import { sql } from "drizzle-orm";
import { jsonBoolean, jsonNumber, jsonText, jsonType, jsonValue } from "@raypx/drizzle/pg";
import { PostgresCloudRepository } from "../src/repositories/cloud/postgres.js";
import { users } from "../src/schema.js";
import { openTestDatabase } from "./database.js";
import { exerciseAccountUsageAggregation } from "./cloud-usage-limits.js";

let connection: Awaited<ReturnType<typeof openTestDatabase>>;
beforeAll(async () => {
  connection = await openTestDatabase();
}, 30_000);
afterAll(async () => {
  await connection?.close();
});
beforeEach(async () => {
  await connection.db.execute(sql`SET client_min_messages=warning`);
  await connection.db.execute(sql`TRUNCATE users CASCADE`);
  await connection.db.insert(users).values([
    { id: "alice", email: "alice@example.com", displayName: "Alice" },
    { id: "bob", email: "bob@example.com", displayName: "Bob" },
  ]);
});

describe("Toolkit extensions in PostgreSQL", { concurrent: false }, () => {
  const data = sql`sample.data`;
  it("decodes typed scalars, literal dotted keys and missing/JSON null values", async () => {
    const document = {
      "literal.key": { 'quote"; SELECT secret; --': 12.5 },
      enabled: true,
      nullValue: null,
      array: ["first"],
    };
    const rows = await connection.db
      .select({
        number: jsonNumber(data, ["literal.key", 'quote"; SELECT secret; --']),
        enabled: jsonBoolean(data, ["enabled"]),
        jsonNullType: jsonType(data, ["nullValue"]),
        missingType: jsonType(data, ["missing"]),
        first: jsonText(data, ["array", "0"]),
        array: jsonValue(data, ["array"]),
      })
      .from(sql`(VALUES (${JSON.stringify(document)}::jsonb)) AS sample(data)`);
    expect(rows).toEqual([
      {
        number: 12.5,
        enabled: true,
        jsonNullType: "null",
        missingType: null,
        first: "first",
        array: ["first"],
      },
    ]);
  });

  it.each(["12.5", {}, [], null])(
    "guards invalid scalar types before casting: %j",
    async (value) => {
      const rows = await connection.db
        .select({ number: jsonNumber(data, ["value"]), boolean: jsonBoolean(data, ["value"]) })
        .from(sql`(VALUES (${JSON.stringify({ value })}::jsonb)) AS sample(data)`);
      expect(rows).toEqual([{ number: null, boolean: null }]);
    },
  );

  it.each([
    ["cloud_usage_calls", "inputTokens", "aggregate-call-1"],
    ["cloud_assets", "byteSize", "aggregate-asset-0"],
  ])("rejects corrupted %s accounting rather than treating it as zero", async (table, key, id) => {
    const repository = new PostgresCloudRepository(connection.db);
    await exerciseAccountUsageAggregation(repository);
    await connection.db.execute(sql`UPDATE ${sql.identifier(table)}
      SET data = jsonb_set(data, ARRAY[${key}]::text[], ${JSON.stringify("not-a-number")}::jsonb)
      WHERE id = ${id}`);
    await expect(
      repository.read((tx) =>
        tx.accountUsage({
          ownerAccountId: "user:alice",
          from: new Date("2026-10-01T00:00:00Z"),
          until: new Date("2026-11-01T00:00:00Z"),
        }),
      ),
    ).rejects.toThrow("Invalid persisted account usage values.");
  });
});
