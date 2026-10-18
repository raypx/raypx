import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

// Expo Doctor uses read-only `npm explain` to inspect the installed graph, even
// in Bun projects. Scope npm's override to this diagnostic child: the root
// devEngines guard continues to reject npm installs in normal commands.
const require = createRequire(import.meta.url);
// expo-doctor's exports map omits its binary, so resolve it from the manifest.
const manifest = require.resolve("expo-doctor/package.json");
const bin = join(
  dirname(manifest),
  (require(manifest) as { bin: Record<string, string> }).bin["expo-doctor"]!,
);
const result = spawnSync(process.execPath, [bin, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, npm_config_force: "true" },
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
