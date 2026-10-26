import type { LocalMethod } from "@raypx/contracts/local";

/** Renderer commands cannot impersonate the host transport or supply task snapshots. */
export function assertRendererLocalMethod(method: LocalMethod) {
  if (method.startsWith("host.") || method === "observed.remote")
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
