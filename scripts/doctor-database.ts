import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectDatabase } from "./lib/doctor/database.ts";

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let code = "DATABASE_CHECK_FAILED";
  try {
    const root = process.env.RAYPX_DOCTOR_ROOT;
    const path = process.env.DATABASE_PATH;
    if (root && path) code = inspectDatabase(root, path);
  } catch {
    // Driver errors and configured paths are private.
  }
  console.log(JSON.stringify({ code }));
  process.exitCode = code === "DATABASE_READY" ? 0 : 1;
}
