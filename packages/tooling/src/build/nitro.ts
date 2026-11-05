import type { NitroConfig } from "nitro/types";

/** Shared Node server deployment settings; apps own routes and runtime plugins. */
export function nitroTarget() {
  return {
    preset: "node-server",
    // Hono clones responses as ResponseInit; retain the standard Fetch getters.
    features: { fastResponse: false },
    compatibilityDate: "2026-10-15",
    devServer: { hostname: "localhost" },
    serverDir: false,
    serverEntry: false,
  } satisfies NitroConfig;
}
