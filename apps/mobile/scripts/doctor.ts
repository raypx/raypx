import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

// Expo Doctor uses read-only `npm explain` to inspect the installed graph, even
// in Bun projects. Scope npm's override to this diagnostic child: the root
// devEngines guard continues to reject npm installs in normal commands.
const require = createRequire(import.meta.url);
const result = spawnSync(
  process.execPath,
  [require.resolve("expo-doctor/bin/expo-doctor.js"), ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: { ...process.env, npm_config_force: "true" },
  },
);
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
