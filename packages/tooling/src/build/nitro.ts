import { fileURLToPath } from "node:url";
import type { NitroConfig } from "nitro/types";

/** Shared deployment settings; each application owns its routes and runtime plugins. */
export function nitroTarget(mode: string, configUrl: string) {
  const cloudflare = mode === "cloudflare";
  return {
    preset: cloudflare ? "cloudflare_module" : "node-server",
    compatibilityDate: "2026-10-15",
    devServer: { hostname: "localhost" },
    serverDir: false,
    serverEntry: false,
    ...(cloudflare
      ? {
          buildDir: fileURLToPath(new URL("./node_modules/.nitro-cloudflare", configUrl)),
          output: { dir: fileURLToPath(new URL("./.output-cloudflare", configUrl)) },
          cloudflare: { deployConfig: false },
          commands: { preview: "wrangler dev --config wrangler.jsonc --local" },
        }
      : {}),
  } satisfies NitroConfig;
}
