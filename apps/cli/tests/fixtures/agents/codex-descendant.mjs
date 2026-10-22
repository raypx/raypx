import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { exitForVersion } from "./version.mjs";

exitForVersion("codex");
writeFileSync("parent-pid", String(process.pid));
Bun.spawn([process.execPath, join(import.meta.dirname, "descendant.mjs")], {
  stdout: "ignore",
  stderr: "ignore",
});
await import("./codex.mjs");
