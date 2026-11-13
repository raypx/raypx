import type { AdministrationOutputs, AuditFilter } from "@raypx/contracts/api";

/** HTTP adapters depend on queries, never their database implementation. */
export interface AdministrationQueries {
  overview(days: 7 | 30): Promise<AdministrationOutputs["overview"]>;
  list(input: AuditFilter): Promise<AdministrationOutputs["audit"]>;
}
