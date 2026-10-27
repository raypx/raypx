import { scopeLocalAccount } from "./config";
import type { LocalMethod } from "@raypx/contracts/local";

/** Renderer commands cannot impersonate the host transport or supply task snapshots. */
export function assertRendererLocalMethod(method: LocalMethod) {
  if (
    method.startsWith("host.") ||
    method === "observed.remote" ||
    method === "approvals.local.watch"
  )
    throw new Error("Use the native account coordination bridge");
  if (
    method.startsWith("agents.") &&
    !method.startsWith("agents.local.") &&
    !["agents.projects", "agents.capabilities", "agents.configure"].includes(method)
  )
    throw new Error("Private agent transport is not available to renderer");
  if (method === "roots.register")
    throw new Error("Use the native directory picker to authorize a directory");
}

/** Inject only trusted connector destinations and legacy local ownership. */
export function rendererLocalParams(
  method: LocalMethod,
  params: unknown,
  configDirs: unknown,
  accountScope: string,
) {
  if (method.startsWith("connectors.") && params && typeof params === "object")
    return { ...params, configDirs };
  if (method.startsWith("agents.local.")) return scopeLocalAccount(accountScope, params);
  return params;
}
