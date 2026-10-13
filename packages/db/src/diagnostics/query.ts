import { sql, type SQL } from "drizzle-orm";
import { buildExplain } from "@raypx/drizzle/diagnostics";
import { timestampKey } from "../pagination.js";
import { v2Projects } from "../schema.js";
import { projectVisibility } from "../v2/visibility.js";
import {
  accountUsageQuery,
  expiredRunsQuery,
  readyRunsQuery,
} from "../repositories/cloud/queries.js";
import { DatabaseDiagnosticError, type ExplainDatabaseRequest } from "./types.js";

const commonKeys = ["query", "analyze", "buffers", "statementTimeoutMs", "lockTimeoutMs"];
const queryKeys = {
  "queued-runs": ["limit"],
  "expired-runs": ["limit", "now"],
  "account-usage": ["accountId", "from", "until"],
  "visible-projects": ["actorId", "limit"],
} as const;

function invalid(): never {
  throw new DatabaseDiagnosticError("INVALID_REQUEST");
}

function integer(value: unknown, fallback: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > max)
    return invalid();
  return value;
}

function date(value: unknown): value is Date {
  return value instanceof Date && Number.isFinite(value.getTime());
}

function id(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 256 &&
    !value.includes("\0")
  );
}

/** Validate before constructing a client, including untyped JavaScript callers. */
export function diagnosticStatement(request: ExplainDatabaseRequest): {
  query: SQL;
  analyze: boolean;
  buffers: boolean;
  statementTimeoutMs: number;
  lockTimeoutMs: number;
} {
  if (
    !request ||
    typeof request !== "object" ||
    typeof request.query !== "string" ||
    !Object.hasOwn(queryKeys, request.query)
  )
    return invalid();
  const keys = new Set<string>([...commonKeys, ...queryKeys[request.query]]);
  if (Object.keys(request).some((key) => !keys.has(key))) return invalid();
  for (const value of [request.analyze, request.buffers])
    if (value !== undefined && typeof value !== "boolean") return invalid();
  const analyze = request.analyze ?? false;
  const buffers = request.buffers ?? false;
  if (buffers && !analyze) return invalid();
  const statementTimeoutMs = integer(request.statementTimeoutMs, 5_000, 30_000);
  const lockTimeoutMs = integer(request.lockTimeoutMs, 1_000, 5_000);
  let query: SQL;
  switch (request.query) {
    case "queued-runs":
      query = readyRunsQuery(integer(request.limit, 50, 100));
      break;
    case "expired-runs":
      if (!date(request.now)) return invalid();
      query = expiredRunsQuery(request.now, integer(request.limit, 50, 100));
      break;
    case "account-usage":
      if (
        !id(request.accountId) ||
        !date(request.from) ||
        !date(request.until) ||
        request.from >= request.until
      )
        return invalid();
      query = accountUsageQuery({
        ownerAccountId: request.accountId,
        from: request.from,
        until: request.until,
      });
      break;
    case "visible-projects": {
      if (!id(request.actorId)) return invalid();
      const time = timestampKey(v2Projects.updatedAt);
      query = sql`SELECT ${v2Projects}.* FROM ${v2Projects}
        WHERE ${projectVisibility(request.actorId)}
        ORDER BY ${time} DESC, ${v2Projects.id} DESC
        LIMIT ${integer(request.limit, 50, 100) + 1}`;
      break;
    }
  }
  return {
    query: buildExplain(query, { analyze, buffers }),
    analyze,
    buffers,
    statementTimeoutMs,
    lockTimeoutMs,
  };
}
