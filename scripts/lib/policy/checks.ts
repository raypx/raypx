import { checkMarkdown } from "./markdown.ts";
import { policyReport, type PolicyReport } from "./report.ts";
import { policyRepository } from "./runtime.ts";
import { checkTypeScript } from "./typescript.ts";
import { checkWorkspaces } from "./workspaces.ts";

/** Read-only structural policy; architecture, dependency versions and unused code have separate gates. */
export async function runPolicy(root: string): Promise<PolicyReport> {
  const repository = await policyRepository(root);
  const findings: PolicyReport["findings"] = [];
  const workspaces = await checkWorkspaces(repository, findings);
  await checkTypeScript(repository, workspaces, findings);
  await checkMarkdown(repository, findings);
  return policyReport(findings);
}
