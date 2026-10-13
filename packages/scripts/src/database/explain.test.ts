import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import type { ExplainDatabaseResult } from "@raypx/db/diagnostics";
import { describe, expect, it, vi } from "vite-plus/test";

import { REPOSITORY_ENV_KEY } from "../runtime/env.js";
import { repositoryRoot } from "../runtime/repository.js";
import { databaseEnvironment, databaseUrl } from "../test-fixtures.js";
import { explainReportSummary, renderExplainReport } from "./explain-report.js";
import { parseExplainArguments, runExplain, type ExplainArguments } from "./explain.js";

const now = new Date("2026-10-13T04:00:00Z");
const report: ExplainDatabaseResult = {
  query: "queued-runs",
  analyze: false,
  planCost: 34.5,
  planRows: 50,
  nodes: [
    { depth: 0, nodeType: "Limit", planCost: 34.5, planRows: 50 },
    { depth: 1, nodeType: "Index Scan", planCost: 40, planRows: 200 },
  ],
};

describe("database explain arguments", () => {
  it("defaults to an estimated queued-runs query", () => {
    expect(parseExplainArguments({}, now)).toEqual({
      query: "queued-runs",
      analyze: false,
      buffers: false,
    });
  });

  it("parses bounded options without passing absent fields as undefined", () => {
    expect(
      parseExplainArguments(
        {
          query: "visible-projects",
          "actor-id": "actor-1",
          analyze: true,
          buffers: true,
          limit: "100",
          "timeout-ms": "30000",
          "lock-timeout-ms": "5000",
        },
        now,
      ),
    ).toEqual({
      query: "visible-projects",
      actorId: "actor-1",
      analyze: true,
      buffers: true,
      limit: 100,
      statementTimeoutMs: 30_000,
      lockTimeoutMs: 5_000,
    });
  });

  it("uses an injected clock for expired Runs and accepts an explicit reference time", () => {
    const injected = parseExplainArguments({ query: "expired-runs" }, now);
    expect(injected).toMatchObject({ query: "expired-runs", now });
    if (injected.query === "expired-runs") expect(injected.now).not.toBe(now);
    expect(
      parseExplainArguments({ query: "expired-runs", now: "2026-10-13T12:00:00+08:00" }, now),
    ).toMatchObject({ query: "expired-runs", now });
  });

  it("requires an explicit account and usage period", () => {
    expect(
      parseExplainArguments(
        {
          query: "account-usage",
          "account-id": "account-1",
          from: "2026-10-01T00:00:00Z",
          until: "2026-11-01T00:00:00Z",
        },
        now,
      ),
    ).toEqual({
      query: "account-usage",
      accountId: "account-1",
      analyze: false,
      buffers: false,
      from: new Date("2026-10-01T00:00:00Z"),
      until: new Date("2026-11-01T00:00:00Z"),
    });
  });

  it.each([
    [{ query: "select-secret-value" }, "--query"],
    [{ buffers: true }, "--buffers requires --analyze"],
    [{ analyze: "secret-value" }, "--analyze"],
    [{ limit: "1.5" }, "--limit"],
    [{ limit: "1e2" }, "--limit"],
    [{ limit: "0" }, "--limit"],
    [{ limit: "101" }, "--limit"],
    [{ "timeout-ms": "30001" }, "--timeout-ms"],
    [{ "lock-timeout-ms": "5001" }, "--lock-timeout-ms"],
    [{ query: "visible-projects", "actor-id": " " }, "--actor-id"],
    [{ query: "account-usage" }, "--account-id"],
    [{ query: "account-usage", "account-id": "account-1" }, "--from"],
    [{ query: "expired-runs", now: "2026-10-13" }, "--now"],
    [{ query: "expired-runs", now: "2026-02-30T00:00:00Z" }, "valid timestamp"],
    [{ query: "queued-runs", "actor-id": "secret-value" }, "unavailable"],
    [{ query: "account-usage", "account-id": "account-1", limit: "3" }, "unavailable"],
    [
      {
        query: "account-usage",
        "account-id": "account-1",
        from: "2026-10-13T00:00:00Z",
        until: "2026-10-13T00:00:00Z",
      },
      "earlier",
    ],
  ] satisfies [ExplainArguments, string][])(
    "rejects invalid arguments without echoing values %j",
    (args, message) => {
      expect(() => parseExplainArguments(args, now)).toThrow(message);
      try {
        parseExplainArguments(args, now);
      } catch (error) {
        expect(String(error)).not.toContain("secret-value");
      }
    },
  );
});

describe("database explain operation", () => {
  it("passes only the validated named query to an injected adapter", async () => {
    const explain = vi.fn(async () => report);
    await expect(runExplain(databaseEnvironment(), {}, { explain, now: () => now })).resolves.toBe(
      report,
    );
    expect(explain).toHaveBeenCalledWith(databaseUrl, {
      query: "queued-runs",
      analyze: false,
      buffers: false,
    });
  });

  it("rejects production environments before calling the adapter or clock", async () => {
    const explain = vi.fn(async () => report);
    const clock = vi.fn(() => now);
    await expect(
      runExplain(databaseEnvironment({ NODE_ENV: "production" }), {}, { explain, now: clock }),
    ).rejects.toThrow("db explain is restricted to development and test");
    expect(explain).not.toHaveBeenCalled();
    expect(clock).not.toHaveBeenCalled();
  });

  it.each(["57014", "QUERY_TIMEOUT", undefined, "secret-query-params"])(
    "does not expose driver messages, query data or causes when code is %s",
    async (code) => {
      const sensitive = Object.assign(new Error("password account-token select-secret-value"), {
        code,
        query: "select-secret-value",
        cause: new Error("secret connection url"),
      });
      const explain = vi.fn(async () => {
        throw sensitive;
      });
      const pending = runExplain(databaseEnvironment(), {}, { explain, now: () => now });
      await expect(pending).rejects.toThrow("Database query diagnostic failed");
      try {
        await pending;
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect(error).not.toHaveProperty("cause");
        expect(String(error)).not.toMatch(/password|account-token|select-secret-value|secret/);
        if (code === "57014" || code === "QUERY_TIMEOUT") expect(String(error)).toContain(code);
      }
    },
  );
});

describe("database explain report", () => {
  it("renders an estimate without implying the query executed", () => {
    expect(renderExplainReport(report, false)).toBe(
      [
        "Query: queued-runs (estimate)",
        "Plan: cost 34.5, rows 50",
        "Limit: cost 34.5, rows 50",
        "  Index Scan: cost 40, rows 200",
      ].join("\n"),
    );
  });

  it("includes measured timings and buffers only when present", () => {
    const measured = {
      ...report,
      analyze: true,
      planningTimeMs: 0.3,
      executionTimeMs: 1.2,
      nodes: [
        {
          ...report.nodes[0]!,
          actualRows: 3,
          actualLoops: 1,
          actualTotalTimeMs: 1.1,
          sharedHitBlocks: 5,
          sharedReadBlocks: 0,
        },
      ],
    };
    expect(renderExplainReport(measured, false)).toContain(
      "actual rows 3, time 1.1 ms, loops 1, buffers hit 5, read 0",
    );
    expect(JSON.parse(renderExplainReport(measured, true))).toEqual(explainReportSummary(measured));
  });

  it("omits raw fields, identifiers and non-finite metrics", () => {
    const unsafe = {
      ...report,
      query: "secret-value",
      parameters: ["secret-value"],
      rawPlan: "secret-value",
      nodes: [
        {
          ...report.nodes[0]!,
          nodeType: "secret-value",
          relation: "secret-value",
          index: "secret-value",
          filter: "secret-value",
          actualRows: Infinity,
        },
      ],
    } as unknown as ExplainDatabaseResult;
    const rendered = renderExplainReport(unsafe, true);
    expect(rendered).not.toContain("secret-value");
    expect(rendered).not.toContain("parameters");
    expect(rendered).not.toContain("actualRows");
    expect(JSON.parse(rendered).nodes[0].nodeType).toBe("Unknown");
  });
});

describe("database explain CLI", () => {
  const cliPath = fileURLToPath(new URL("../cli.ts", import.meta.url));
  const environment = {
    ...process.env,
    [REPOSITORY_ENV_KEY]: repositoryRoot,
    NO_COLOR: "1",
    NODE_ENV: "test",
    DATABASE_URL: "postgres://secret-user:secret-password@localhost/raypx_test",
  };

  it("shows query options without loading environment schemas", () => {
    const result = spawnSync("bun", [cliPath, "db", "explain", "--help"], {
      encoding: "utf8",
      env: { ...environment, NODE_ENV: "invalid-for-schema" },
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("--query");
    expect(result.stdout).toContain("--analyze");
    expect(result.stdout).toContain("--json");
  });

  it("exits nonzero for invalid input without printing secrets or connecting", () => {
    const result = spawnSync("bun", [cliPath, "db", "explain", "--limit", "secret-value"], {
      encoding: "utf8",
      env: environment,
    });
    expect(result.status).toBe(1);
    const output = result.stdout + result.stderr;
    expect(output).toContain("--limit must be an integer");
    expect(output).not.toMatch(/secret-value|secret-user|secret-password/);
  });
});
