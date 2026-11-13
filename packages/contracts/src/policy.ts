import { defineMeta } from "@orpc/contract";
import type { AccountPermission } from "./access.js";

type RpcAccess = "public" | AccountPermission;

export const [rpcAccess, getRpcAccess] = defineMeta(
  "raypx.rpcAccess",
  (policy: RpcAccess) => policy,
);
