import { createBackendRuntime } from "../../server/runtime/backend.ts";
import { serveBackend } from "./backend-server.ts";

const runtime = await createBackendRuntime(process.env);
const server = serveBackend(runtime, Number(process.env.PORT));
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  await runtime.close();
  await server.stop(true);
};
process.on("SIGTERM", () => void stop());
process.on("SIGINT", () => void stop());
