import type { NitroConfig } from "nitro/types";

/** Shared Bun server deployment settings; apps own routes and runtime plugins. */
export function nitroTarget() {
  return {
    preset: "bun",
    compatibilityDate: "2026-10-15",
    devServer: { hostname: "localhost" },
    serverDir: false,
    serverEntry: false,
  } satisfies NitroConfig;
}
