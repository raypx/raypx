import { resolve } from "node:path";

const node = process.env.NODE_BINARY;
if (!node)
  throw new Error("Run bun run test:e2e from the repository root to select the pinned Node");
const child = Bun.spawn(
  [node, resolve(import.meta.dirname, "../../../apps/web/.output/server/index.mjs")],
  {
    env: { ...process.env, NODE_ENV: "production", HOST: "127.0.0.1", PORT: "4173" },
    stdin: "ignore",
    stdout: "inherit",
    stderr: "inherit",
  },
);
const interrupt = () => child.kill("SIGINT");
const terminate = () => child.kill("SIGTERM");
process.once("SIGINT", interrupt);
process.once("SIGTERM", terminate);
try {
  process.exitCode = await child.exited;
} finally {
  process.off("SIGINT", interrupt);
  process.off("SIGTERM", terminate);
}
