import { sql } from "drizzle-orm";
import { jsonNumber, jsonText, jsonType } from "@raypx/drizzle/pg";

const data = sql.identifier("data");

/** Shared statements keep diagnostics on the repository's actual query shape. */
export function accountUsageQuery({
  ownerAccountId,
  from,
  until,
}: {
  ownerAccountId: string;
  from: Date;
  until: Date;
}) {
  return sql`
    SELECT calls, "reservedCalls", "unknownCalls", "inputTokens", "outputTokens",
      "estimatedCost", "storageBytes", "activeRuns",
      usage.invalid_values + assets.invalid_values AS "invalidAccountingValues"
    FROM (
      SELECT count(*) FILTER (WHERE state <> 'released') AS calls,
        count(*) FILTER (WHERE state = 'reserved') AS "reservedCalls",
        count(*) FILTER (WHERE state = 'unknown') AS "unknownCalls",
        coalesce(sum(${jsonNumber(data, ["inputTokens"])}), 0) AS "inputTokens",
        coalesce(sum(${jsonNumber(data, ["outputTokens"])}), 0) AS "outputTokens",
        coalesce(sum(${jsonNumber(data, ["estimatedCost"])}), 0) AS "estimatedCost",
        count(*) FILTER (WHERE
          ${jsonType(data, ["inputTokens"])} NOT IN ('number', 'null') OR
          ${jsonType(data, ["outputTokens"])} NOT IN ('number', 'null') OR
          ${jsonType(data, ["estimatedCost"])} NOT IN ('number', 'null')
        ) AS invalid_values
      FROM cloud_usage_calls
      WHERE owner_account_id = ${ownerAccountId}
        AND created_at >= ${from.toISOString()} AND created_at < ${until.toISOString()}
    ) usage
    CROSS JOIN (
      SELECT coalesce(sum(${jsonNumber(data, ["byteSize"])}), 0) AS "storageBytes",
        count(*) FILTER (WHERE ${jsonType(data, ["byteSize"])} NOT IN ('number', 'null')) AS invalid_values
      FROM cloud_assets WHERE ${jsonText(data, ["ownerAccountId"])} = ${ownerAccountId}
    ) assets
    CROSS JOIN (
      SELECT count(*) AS "activeRuns" FROM cloud_runs
      WHERE owner_account_id = ${ownerAccountId}
        AND status NOT IN ('needs_input', 'succeeded', 'failed', 'cancelled')
    ) runs
  `;
}

export function readyRunsQuery(limit: number) {
  return sql`SELECT data FROM cloud_runs WHERE status='queued' ORDER BY created_at,id LIMIT ${limit}`;
}

export function expiredRunsQuery(now: Date, limit: number) {
  return sql`SELECT data FROM cloud_runs WHERE status='running' AND (lease_expires_at IS NULL OR lease_expires_at<=${now.toISOString()}) ORDER BY lease_expires_at NULLS FIRST,id LIMIT ${limit}`;
}
