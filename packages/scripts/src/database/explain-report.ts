import type { ExplainDatabaseResult } from "@raypx/db/diagnostics";

const nodeTypes = new Set([
  "Aggregate",
  "Append",
  "Bitmap Heap Scan",
  "Bitmap Index Scan",
  "BitmapAnd",
  "BitmapOr",
  "CTE Scan",
  "Custom Scan",
  "Foreign Scan",
  "Function Scan",
  "Gather",
  "Gather Merge",
  "Group",
  "Hash",
  "Hash Join",
  "Incremental Sort",
  "Index Only Scan",
  "Index Scan",
  "Limit",
  "LockRows",
  "Materialize",
  "Memoize",
  "Merge Append",
  "Merge Join",
  "Nested Loop",
  "ProjectSet",
  "Recursive Union",
  "Result",
  "Sample Scan",
  "Seq Scan",
  "SetOp",
  "Sort",
  "Subquery Scan",
  "Table Function Scan",
  "Tid Range Scan",
  "Tid Scan",
  "Unique",
  "Values Scan",
  "WindowAgg",
  "WorkTable Scan",
]);

function metric(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

function optionalMetric<Key extends string>(
  name: Key,
  value: unknown,
): Partial<Record<Key, number>> {
  const number = metric(value);
  return (number === undefined ? {} : { [name]: number }) as Partial<Record<Key, number>>;
}

/** Output only known summary fields; PostgreSQL filters and SQL never enter the report. */
export function explainReportSummary(report: ExplainDatabaseResult) {
  const queries = new Set(["queued-runs", "expired-runs", "account-usage", "visible-projects"]);
  return {
    query: queries.has(report.query) ? report.query : "Unknown",
    analyze: report.analyze === true,
    planCost: metric(report.planCost) ?? 0,
    planRows: metric(report.planRows) ?? 0,
    ...optionalMetric("planningTimeMs", report.planningTimeMs),
    ...optionalMetric("executionTimeMs", report.executionTimeMs),
    nodes: report.nodes.map((node) => ({
      depth: Math.min(Math.floor(metric(node.depth) ?? 0), 50),
      nodeType: nodeTypes.has(node.nodeType) ? node.nodeType : "Unknown",
      planCost: metric(node.planCost) ?? 0,
      planRows: metric(node.planRows) ?? 0,
      ...optionalMetric("actualRows", node.actualRows),
      ...optionalMetric("actualTotalTimeMs", node.actualTotalTimeMs),
      ...optionalMetric("actualLoops", node.actualLoops),
      ...optionalMetric("sharedHitBlocks", node.sharedHitBlocks),
      ...optionalMetric("sharedReadBlocks", node.sharedReadBlocks),
    })),
  };
}

export function renderExplainReport(report: ExplainDatabaseResult, json: boolean): string {
  const summary = explainReportSummary(report);
  if (json) return JSON.stringify(summary, null, 2);
  const lines = [
    `Query: ${summary.query} (${summary.analyze ? "analyze" : "estimate"})`,
    `Plan: cost ${summary.planCost}, rows ${summary.planRows}`,
  ];
  if (summary.planningTimeMs !== undefined) lines.push(`Planning: ${summary.planningTimeMs} ms`);
  if (summary.executionTimeMs !== undefined) lines.push(`Execution: ${summary.executionTimeMs} ms`);
  for (const node of summary.nodes) {
    const actual = node.actualRows === undefined ? "" : `, actual rows ${node.actualRows}`;
    const time = node.actualTotalTimeMs === undefined ? "" : `, time ${node.actualTotalTimeMs} ms`;
    const loops = node.actualLoops === undefined ? "" : `, loops ${node.actualLoops}`;
    const buffers =
      node.sharedHitBlocks === undefined && node.sharedReadBlocks === undefined
        ? ""
        : `, buffers hit ${node.sharedHitBlocks ?? 0}, read ${node.sharedReadBlocks ?? 0}`;
    lines.push(
      `${"  ".repeat(node.depth)}${node.nodeType}: cost ${node.planCost}, rows ${node.planRows}${actual}${time}${loops}${buffers}`,
    );
  }
  return lines.join("\n");
}
