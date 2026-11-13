import type { Database } from "@raypx/database/connection";
import { AuditUnavailable, type AuditService } from "../admin/audit.js";
import { writeAuditSuccess } from "../admin/repository.js";
import type { ConfigReads, ConfigScope } from "./reads.js";
import { ConfigError } from "./service.js";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
type Changes = Parameters<typeof writeAuditSuccess>[2];

export interface AuditedSettingWrite {
  db: Database;
  audit: AuditService;
  reads: ConfigReads;
  scope: Exclude<ConfigScope, "site">;
}

/**
 * The one write path for an administrator-managed provider setting. The caller's
 * revision check and row change run in a transaction that also commits the audit
 * success, so neither exists without the other; readers are invalidated only after
 * that commit. `change` throws `ConfigError` to refuse the write.
 */
export async function writeAuditedSetting<Snapshot extends { revision: number }>(
  { db, audit, reads, scope }: AuditedSettingWrite,
  change: (tx: Transaction) => Promise<{ snapshot: Snapshot; changes: Changes }>,
): Promise<Snapshot> {
  const operation = audit.current();
  if (!operation || operation.action !== "configuration.update") throw new AuditUnavailable();
  operation.mutationStarted = true;
  let result: Snapshot;
  try {
    result = await db.transaction(async (tx) => {
      const { snapshot, changes } = await change(tx);
      await writeAuditSuccess(tx, operation, changes);
      return snapshot;
    });
  } catch (error) {
    if (error instanceof ConfigError || error instanceof AuditUnavailable) throw error;
    throw new ConfigError("CONFIGURATION_UNAVAILABLE");
  }
  operation.committed = true;
  reads.committed(scope, result.revision);
  return result;
}
