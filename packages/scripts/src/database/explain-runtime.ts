import type { ExplainDependencies } from "./explain.js";

export async function createExplainDependencies(): Promise<ExplainDependencies> {
  const { explainDatabaseQuery } = await import("@raypx/db/diagnostics");
  return { explain: explainDatabaseQuery, now: () => new Date() };
}
