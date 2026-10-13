import type { ExplainDatabaseRequest, ExplainDatabaseResult } from "@raypx/db/diagnostics";

import type { DatabaseScriptsEnvironment } from "../env.js";
import { assertDevelopmentDatabaseCommand, requireDatabaseUrl } from "./policy.js";

export interface ExplainArguments {
  query?: unknown;
  analyze?: unknown;
  buffers?: unknown;
  limit?: unknown;
  "account-id"?: unknown;
  "actor-id"?: unknown;
  from?: unknown;
  until?: unknown;
  now?: unknown;
  "timeout-ms"?: unknown;
  "lock-timeout-ms"?: unknown;
}

export interface ExplainDependencies {
  explain(databaseUrl: string, request: ExplainDatabaseRequest): Promise<ExplainDatabaseResult>;
  now(): Date;
}

function optionalInteger(value: unknown, flag: string, maximum: number): number | undefined {
  if (value === undefined) return undefined;
  const number = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1 || number > maximum) {
    throw new Error(`${flag} must be an integer between 1 and ${maximum}.`);
  }
  return number;
}

function booleanFlag(value: unknown, flag: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== "boolean") throw new Error(`${flag} must be a boolean flag.`);
  return value;
}

function identifier(value: unknown, flag: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256) {
    throw new Error(`${flag} is required and must be a non-empty identifier.`);
  }
  return value;
}

function dateArgument(value: unknown, flag: string): Date {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  ) {
    throw new Error(`${flag} requires an ISO timestamp with a timezone.`);
  }
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const hour = Number(value.slice(11, 13));
  const minute = Number(value.slice(14, 16));
  const second = Number(value.slice(17, 19));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    throw new Error(`${flag} requires a valid timestamp.`);
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error(`${flag} requires a valid timestamp.`);
  return date;
}

function rejectArguments(args: ExplainArguments, flags: readonly (keyof ExplainArguments)[]): void {
  for (const flag of flags) {
    if (args[flag] !== undefined) throw new Error(`--${flag} is unavailable for this query.`);
  }
}

/** Parse CLI input without opening a database or including argument values in errors. */
export function parseExplainArguments(args: ExplainArguments, now: Date): ExplainDatabaseRequest {
  const query = args.query ?? "queued-runs";
  if (typeof query !== "string") {
    throw new Error(
      "--query must be queued-runs, expired-runs, account-usage, or visible-projects.",
    );
  }
  const analyze = booleanFlag(args.analyze, "--analyze");
  const buffers = booleanFlag(args.buffers, "--buffers");
  if (buffers && !analyze) throw new Error("--buffers requires --analyze.");
  const limit = optionalInteger(args.limit, "--limit", 100);
  const statementTimeoutMs = optionalInteger(args["timeout-ms"], "--timeout-ms", 30_000);
  const lockTimeoutMs = optionalInteger(args["lock-timeout-ms"], "--lock-timeout-ms", 5_000);
  const options = {
    analyze,
    buffers,
    ...(statementTimeoutMs === undefined ? {} : { statementTimeoutMs }),
    ...(lockTimeoutMs === undefined ? {} : { lockTimeoutMs }),
  };

  switch (query) {
    case "queued-runs":
      rejectArguments(args, ["account-id", "actor-id", "from", "until", "now"]);
      return { query, ...options, ...(limit === undefined ? {} : { limit }) };
    case "expired-runs": {
      rejectArguments(args, ["account-id", "actor-id", "from", "until"]);
      const at = args.now === undefined ? new Date(now) : dateArgument(args.now, "--now");
      if (!Number.isFinite(at.getTime())) throw new Error("The diagnostic clock is invalid.");
      return { query, ...options, now: at, ...(limit === undefined ? {} : { limit }) };
    }
    case "account-usage": {
      rejectArguments(args, ["actor-id", "limit", "now"]);
      const accountId = identifier(args["account-id"], "--account-id");
      const from = dateArgument(args.from, "--from");
      const until = dateArgument(args.until, "--until");
      if (from >= until) throw new Error("--from must be earlier than --until.");
      return { query, ...options, accountId, from, until };
    }
    case "visible-projects":
      rejectArguments(args, ["account-id", "from", "until", "now"]);
      return {
        query,
        ...options,
        actorId: identifier(args["actor-id"], "--actor-id"),
        ...(limit === undefined ? {} : { limit }),
      };
    default:
      throw new Error(
        "--query must be queued-runs, expired-runs, account-usage, or visible-projects.",
      );
  }
}

const diagnosticCodes = new Set([
  "INVALID_REQUEST",
  "QUERY_TIMEOUT",
  "QUERY_FAILED",
  "INVALID_PLAN",
]);

function safeDiagnosticError(error: unknown): Error {
  const code =
    typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  const safeCode =
    typeof code === "string" && (diagnosticCodes.has(code) || /^[0-9A-Z]{5}$/.test(code))
      ? ` (${code})`
      : "";
  return new Error(`Database query diagnostic failed${safeCode}.`);
}

export async function runExplain(
  environment: DatabaseScriptsEnvironment,
  args: ExplainArguments,
  dependencies: ExplainDependencies,
): Promise<ExplainDatabaseResult> {
  assertDevelopmentDatabaseCommand("db explain", environment);
  const databaseUrl = requireDatabaseUrl(environment);
  const request = parseExplainArguments(args, dependencies.now());
  try {
    return await dependencies.explain(databaseUrl, request);
  } catch (error) {
    // Driver errors contain queries, bound parameters and connection information.
    // The shared CLI boundary receives only a new error with a fixed message.
    throw safeDiagnosticError(error);
  }
}
