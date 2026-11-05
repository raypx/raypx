import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { exitForVersion } from "./version.ts";

exitForVersion("codex");
writeFileSync("parent-pid", String(process.pid));
spawn(process.execPath, [join(import.meta.dirname, "descendant.ts")], {
  stdio: "ignore",
});
await import("./codex.ts");
