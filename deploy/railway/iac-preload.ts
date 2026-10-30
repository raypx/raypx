import { fileURLToPath } from "node:url";

// Railway's Node-style evaluator can lose its file argument under bunx --bun.
// This preload applies only to the IaC child process for this repository.
if (process.env.RAILWAY_IAC_CONTEXT && !process.argv[1]) {
  process.argv[1] = fileURLToPath(new URL("../../.railway/railway.ts", import.meta.url));
}
