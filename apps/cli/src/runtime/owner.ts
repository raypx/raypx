import { createHost } from "./host.js";
import { createRuntime } from "./index.js";
import type { ExecutionMode } from "./options.js";

export type ExecutionHost = ReturnType<typeof createHost>;
type Host = ExecutionHost;
type Owner = Pick<Host, "runtime" | "request" | "close">;
type OwnerOptions = Omit<Parameters<typeof createHost>[0], "owner"> & { mode: ExecutionMode };

export function createExecutionOwner(options: OwnerOptions & { mode: "daemon" }): Host;
export function createExecutionOwner(
  options: OwnerOptions & { mode: "stdio" },
  platform: "win32",
): Host;
export function createExecutionOwner(options: OwnerOptions, platform?: NodeJS.Platform): Owner;
/** Entry adapters select ownership once; services retain the same local request contract. */
export function createExecutionOwner(options: OwnerOptions, platform = process.platform): Owner {
  if (options.mode === "daemon" || (options.mode === "stdio" && platform === "win32")) {
    const host = createHost({
      ...options,
      owner: options.mode === "daemon" ? "daemon" : "foreground",
    });
    if (options.mode === "stdio") host.restore();
    return host;
  }
  const runtime = createRuntime(options);
  return {
    runtime,
    request: (method, params) => runtime.request(method, params),
    close: () => runtime.close(),
  };
}
