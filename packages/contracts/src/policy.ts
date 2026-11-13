import { defineMeta } from "@orpc/contract";
import type { AccountPermission } from "./access.js";
import type { AuditEntry } from "./admin.js";

/** `public` needs no session, `session` any signed-in account, the rest a granted permission. */
type RpcAccess = "public" | "session" | AccountPermission;

export const [rpcAccess, getRpcAccess] = defineMeta(
  "raypx.rpcAccess",
  (policy: RpcAccess) => policy,
);

/** Marks a mutation that must run inside a durable administration audit record. */
export const [rpcAudit, getRpcAudit] = defineMeta(
  "raypx.rpcAudit",
  (action: AuditEntry["action"]) => action,
);
